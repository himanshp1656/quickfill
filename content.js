
// Step 1: Extract the page title
(() => {
    let credentialsData = [];
    let geminiApiKey = '';
    let suggestionsContainer = null;
    let activeSuggestionIndex = -1;
    let currentAnchorInput = null;

    // Load data from storage (resilient to extension reloads)
    async function loadStoredData() {
        return new Promise((resolve) => {
            try {
                if (!chrome?.runtime?.id || !chrome?.storage?.sync) {
                    console.warn('QuickFill: extension context not available yet');
                    resolve();
                    return;
                }
                chrome.storage.sync.get(['connectors', 'geminiApiKey'], (result) => {
                    credentialsData = result?.connectors || [];
                    geminiApiKey = result?.geminiApiKey || '';
                    console.log('Loaded from storage:', { credentialsData, geminiApiKey });
                    resolve();
                });
            } catch (err) {
                console.warn('QuickFill: failed to access chrome.storage (possibly reloaded). Refresh the page to restore.', err);
                resolve();
            }
        });
    }

    function extractPageTitle() {
        return document.title; // Get the current page's title
    }

// Step 2: Flexible search for credentials in the data based on the page title
function searchCredentialsByTitle(title) {
    const matchingCredentials = credentialsData.filter(cred =>
        cred.title.toLowerCase().split(' ').some(word => title.toLowerCase().includes(word))
    );

    if (matchingCredentials.length === 0) {
        console.error(`No credentials found matching the title: ${title}`);
    }

    return matchingCredentials;
}

// Step 3: Extract the form fields from the page
async function extractForms() {
    const forms = [];
    const formElements = document.querySelectorAll('form');

    formElements.forEach((form) => {
        const fields = [];
        const inputs = form.querySelectorAll('input, select, textarea');

        inputs.forEach((input) => {
            const id = input.id || '';
            const name = input.name || '';
            const placeholder = input.placeholder || '';
            const type = input.type || 'text';
            let label = '';
            let nearbyText = '';

            // Priority 1: Explicit label element
            if (id) {
                const labelElement = form.querySelector(`label[for="${id}"]`);
                if (labelElement) {
                    label = labelElement.innerText.trim();
                }
            }

            // Priority 2: Parent label
            if (!label) {
                const parentLabel = input.closest('label');
                if (parentLabel) {
                    label = parentLabel.innerText.trim();
                    // Remove the input value from label text if it got included
                    if (input.value && label.includes(input.value)) {
                        label = label.replace(input.value, '').trim();
                    }
                }
            }

            // Priority 3: Nearby text content (look for text near the input)
            if (!label) {
                // Look for text in previous sibling elements
                let sibling = input.previousElementSibling;
                while (sibling && !nearbyText) {
                    if (sibling.textContent && sibling.textContent.trim()) {
                        const text = sibling.textContent.trim();
                        // Skip if it's just symbols or very short
                        if (text.length > 2 && !/^[^a-zA-Z]*$/.test(text)) {
                            nearbyText = text;
                            break;
                        }
                    }
                    sibling = sibling.previousElementSibling;
                }

                // Look in parent containers for descriptive text
                if (!nearbyText) {
                    let parent = input.parentElement;
                    let depth = 0;
                    while (parent && depth < 3) {
                        // Look for spans, divs, or other elements with descriptive text
                        const textElements = parent.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6, strong, b');
                        for (let textEl of textElements) {
                            const text = textEl.textContent.trim();
                            if (text.length > 2 && text.length < 50 && !/^[^a-zA-Z]*$/.test(text) && 
                                !text.includes(input.value || '') && textEl !== input) {
                                nearbyText = text;
                                break;
                            }
                        }
                        if (nearbyText) break;
                        parent = parent.parentElement;
                        depth++;
                    }
                }
            }

            // Priority 4: Aria-label or aria-labelledby
            if (!label && !nearbyText) {
                if (input.getAttribute('aria-label')) {
                    label = input.getAttribute('aria-label').trim();
                } else if (input.getAttribute('aria-labelledby')) {
                    const labelledBy = document.getElementById(input.getAttribute('aria-labelledby'));
                    if (labelledBy) {
                        label = labelledBy.textContent.trim();
                    }
                }
            }

            fields.push({
                id,
                name,
                type,
                placeholder,
                label,
                nearbyText
            });
        });

        let formContext = '';
        const heading = form.closest('section, div, article')?.querySelector('h1, h2, h3');
        if (heading) {
            formContext = heading.innerText.trim();
        }

        forms.push({
            formContext,
            fields
        });
    });

    return forms;
}

// Extract form fields for connector creation
async function extractFormFieldsForConnector() {
    const forms = await extractForms();
    const allFields = [];
    const seenFields = new Set();
    
    // Extract unique fields from all forms
    forms.forEach(form => {
        form.fields.forEach(field => {
            // Skip empty fields or common non-credential fields
            if (!field.id && !field.name && !field.placeholder && !field.label) return;
            if (field.type === 'submit' || field.type === 'button') return;
            
            // Prioritize user-visible text over technical attributes
            const fieldIdentifier = field.label || field.nearbyText || field.placeholder || field.name || field.id;
            if (!fieldIdentifier) return;  // Skip if no identifier found
            
            const fieldKey = fieldIdentifier.toLowerCase();
            
            // Skip if we've already seen this field
            if (seenFields.has(fieldKey)) return;
            seenFields.add(fieldKey);
            
            // Clean up field name - preserve user-visible labels as much as possible
            let cleanFieldName = fieldIdentifier.trim();
            
            // If it's a user-visible label (from label or nearbyText), preserve it more
            const isUserVisibleLabel = field.label === fieldIdentifier || field.nearbyText === fieldIdentifier;
            
            if (isUserVisibleLabel) {
                // For user-visible labels, keep exactly as they appear in UI
                cleanFieldName = cleanFieldName
                    .replace(/[*:]+\s*$/g, '')  // Only remove trailing asterisks and colons
                    .trim();
            } else {
                // For technical fields (id, name, etc.), do more aggressive cleaning
                
                // Handle dot notation (e.g., "item.credential.guid.host" → "host")
                if (cleanFieldName.includes('.')) {
                    const parts = cleanFieldName.split('.');
                    // Take the last meaningful part, but skip generic ones
                    const meaningfulParts = parts.filter(part => 
                        !['item', 'credential', 'guid', 'basic', 'extra', 'advanced', 'config', 'form', 'field', 'input', 'data'].includes(part.toLowerCase())
                    );
                    cleanFieldName = meaningfulParts.length > 0 ? meaningfulParts[meaningfulParts.length - 1] : parts[parts.length - 1];
                }
                
                // Handle complex prefixes and suffixes for technical fields only
                cleanFieldName = cleanFieldName
                    .replace(/^(item|credential|guid|form|input|field|data|model|entity|object)[-_]?/i, '')
                    .replace(/[-_]?(item|credential|guid|form|input|field|data|model|entity|object)$/i, '')
                    .replace(/^(connection|conn|auth|config|cfg|setting|settings)[-_]?/i, '')
                    .replace(/[-_]?(connection|conn|auth|config|cfg|setting|settings)$/i, '')
                    .replace(/[-_]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                // Convert camelCase for technical fields
                cleanFieldName = cleanFieldName
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .toLowerCase()
                    .trim();
            }
            
            // If still empty or too generic, use original identifier
            if (!cleanFieldName || cleanFieldName.length < 1) {
                cleanFieldName = fieldIdentifier;
            }
            
            // No field mapping - keep exactly what's in the UI
            
            // Final cleanup - preserve user-visible text exactly as it appears
            if (isUserVisibleLabel) {
                // For user-visible labels, keep them exactly as they appear in the UI
                cleanFieldName = cleanFieldName.trim();
            } else {
                // For technical fields, make them programming-friendly
                cleanFieldName = cleanFieldName
                    .replace(/[^a-z0-9_\s]/g, '')  // Remove special characters except underscore and space
                    .replace(/\s+/g, '_')  // Replace spaces with underscores
                    .replace(/_{2,}/g, '_')  // Replace multiple underscores with single
                    .replace(/^_|_$/g, '')  // Remove leading/trailing underscores
                    .trim();
            }
            
            // Ensure we have a valid field name
            if (!cleanFieldName || cleanFieldName.length < 1) {
                cleanFieldName = 'field';
            }
            
            allFields.push({
                id: field.id,
                name: field.name,
                type: field.type,
                placeholder: field.placeholder,
                label: field.label,
                cleanName: cleanFieldName
            });
        });
    });
    
    // Keep fields in the order they appear in the form (natural order)
    // No artificial sorting - preserve the UI order
    
    return {
        pageTitle: extractPageTitle(),
        fields: allFields,
        formsCount: forms.length,
        formUrl: window.location.origin + window.location.pathname
    };
}

// Step 4: Send form and credentials to Gemini for key-value pair mapping
async function sendToGemini(forms, credentialsData) {
    if (!geminiApiKey) {
        console.error('Gemini API key not found. Please set it in the extension popup.');
        showToast('error', 'Gemini API key not found. Please set it in the extension popup.');
        return;
    }
    
    // Prepare the prompt
    const prompt = `Identify the credentials fields in the form based on the page context and its fields:\n\nPage Title: ${document.title}\n\nForm Data:\n${JSON.stringify(forms, null, 2)}\n\nCredentials Data:\n${JSON.stringify(credentialsData, null, 2)}\n\nProvide the corresponding field IDs for all credential fields in a JSON object. like { form_item_credential-guid.basic.extra.database: "postgres} we will autofill this so i need the the mapping for all the fields in a format of field-id-from-form:value-from-data"`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: prompt }
                    ]
                }
            ]
        })
    });

    const result = await response.json();

    if (!result || !result.candidates || result.candidates.length === 0) {
        console.error("No valid response from Gemini API.");
        return;
    }

    const text = result.candidates[0].content?.parts?.[0]?.text || '';
    if (!text) {
        console.error("Gemini did not return any valid text for key-value pairs.");
        return;
    }

    // Try parsing the response from Gemini (should be a key-value pair JSON)
    try {
        const fieldMap = JSON.parse(text.match(/{[\s\S]*}/)?.[0] || '{}');
        console.log("Parsed field map:", fieldMap);
        autofillFields(fieldMap);
        showToast('success', 'Form autofill successful');
    } catch (e) {
        console.error("Failed to parse Gemini response:", e);
    }
}

// Step 5: Autofill the form fields based on Gemini's key-value pair mapping
// Step 5: Autofill the form fields based on Gemini's key-value pair mapping
function autofillFields(fieldMap) {
    console.log("Autofilling fields with the following mapping:", fieldMap);

    // Loop through the field map and autofill the fields on the page based on IDs
    Object.entries(fieldMap).forEach(([formFieldId, fieldValue]) => {
        const input = document.getElementById(formFieldId);

        if (input) {
            input.value = fieldValue; // Fill the field with the corresponding value
            input.dispatchEvent(new Event('input', { bubbles: true })); // Trigger input event to notify the form
            console.log(`Autofilled field: ${formFieldId} with value:`, fieldValue);
        } else {
            console.error(`Field with ID ${formFieldId} not found on the page.`);
        }
        
    });
}

// Step 6: Retrieve credentials for a specific field from the data
function getCredentialsForField(fieldCredentialId) {
    const matchingCredential = credentialsData.find(cred =>
        cred.fields.some(field => field.reference === fieldCredentialId)
    );

    if (!matchingCredential) {
        
        console.error(`No matching credentials found for: ${fieldCredentialId}`);
        return null;
    }

    // Return the value of the matching field
    const field = matchingCredential.fields.find(f => f.reference === fieldCredentialId);
    return field ? field.value : null;
}


// Step 7: Process the page
async function processPage(connectorName) {
    // Load stored data first
    await loadStoredData();
    
    if (credentialsData.length === 0) {
        console.error('No connectors found in storage.');
        showToast('error', 'No connectors found. Please add connectors in the extension popup.');
        return;
    }
    
    const title = extractPageTitle();
    console.log("Page Title:", title);
    let matchingCredentials;
    if (connectorName && connectorName.trim() !== '') {
        console.log("Using connector name:", connectorName);
        // Exact match first (clicked item), fallback to flexible if not found
        matchingCredentials = credentialsData.filter(c => c.title.toLowerCase() === connectorName.toLowerCase());
        if (matchingCredentials.length === 0) {
            matchingCredentials = searchCredentialsByTitle(connectorName);
        }
    } else {
        matchingCredentials = searchCredentialsByTitle(title);
    }
    
    console.log("Matching Credentials:", matchingCredentials);
    if (matchingCredentials.length === 0) {
        showToast('error', 'No credentials found for this page.');
        console.log("No credentials found for this page.");
        return;
    }
    
    const forms = await extractForms();
    console.log("Extracted Forms:", forms);
    
    // Send the extracted forms and matching credentials to Gemini for field identification
    sendToGemini(forms, matchingCredentials);
    console.log("Sent to Gemini");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received in content.js:", message);
    
    if (message.action === 'extractFormFields') {
        // Extract form fields and return them
        extractFormFieldsForConnector().then(result => {
            sendResponse(result);
        }).catch(error => {
            console.error('Error extracting form fields:', error);
            sendResponse({ error: error.message });
        });
        return true; // Keep the message channel open for async response
    } else {
        // Default behavior - process page for autofill
        processPage(message.connectorName);
    }
});


  function injectToastStyles() {
    if (document.getElementById('toastStyles')) return;
  
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.innerHTML = `
      #toastContainer {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
  
      .toast {
        padding: 12px 18px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        color: #fff;
        min-width: 200px;
        max-width: 300px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        animation: slideIn 0.4s ease, fadeOut 0.4s ease 4.6s forwards;
      }
  
      .toast.success {
        background: #28a745;
      }
  
      .toast.error {
        background: #dc3545;
      }
  
      @keyframes slideIn {
        from { opacity: 0; transform: translateX(100%); }
        to   { opacity: 1; transform: translateX(0); }
      }
  
      @keyframes fadeOut {
        to { opacity: 0; transform: translateX(100%); }
      }
    `;
    document.head.appendChild(style);
  }
  
  function showToast(type, message) {
    injectToastStyles();
  
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      document.body.appendChild(container);
    }
  
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
  
    setTimeout(() => {
      toast.remove();
    }, 5000); // stays for 5 seconds
  }
  
  // Inline suggestions (connector picker)
  function injectSuggestionStyles() {
    if (document.getElementById('quickfill-suggestions-styles')) return;
    const style = document.createElement('style');
    style.id = 'quickfill-suggestions-styles';
    style.innerHTML = `
      .quickfill-suggestions {
        position: absolute;
        z-index: 2147483647;
        background: #0f1220;
        color: #e0e6f1;
        border: 1px solid rgba(123,149,214,0.35);
        border-radius: 10px;
        box-shadow: 0 12px 30px rgba(0,0,0,0.35);
        overflow: hidden;
        min-width: 240px;
        max-width: 360px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .quickfill-suggestions-header {
        padding: 10px 12px;
        font-size: 12px;
        color: #8ea2e1;
        border-bottom: 1px solid rgba(123,149,214,0.2);
      }
      .quickfill-suggestion-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        cursor: pointer;
        transition: background 0.12s ease;
      }
      .quickfill-suggestion-item:hover,
      .quickfill-suggestion-item.active {
        background: rgba(123,149,214,0.18);
      }
      .quickfill-suggestion-title {
        font-weight: 600;
        font-size: 13px;
      }
      .quickfill-suggestion-sub {
        font-size: 11px;
        color: #a8b3d6;
      }
    `;
    document.head.appendChild(style);
  }

  function normalize(text) {
    return (text || '')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function tokenize(text) {
    const norm = normalize(text);
    return new Set(norm ? norm.split(' ').filter(Boolean) : []);
  }

  function jaccardSimilarity(aSet, bSet) {
    if (!aSet.size || !bSet.size) return 0;
    let inter = 0;
    aSet.forEach(tok => { if (bSet.has(tok)) inter += 1; });
    const union = new Set([...aSet, ...bSet]).size;
    return inter / union;
  }

  function buildFormFieldVocabulary(forms) {
    const vocab = new Set();
    forms.forEach(form => {
      form.fields.forEach(f => {
        [f.id, f.name, f.placeholder, f.label, f.nearbyText]
          .filter(Boolean)
          .map(normalize)
          .forEach(val => {
            if (!val) return;
            val.split(' ').forEach(token => {
              const trimmed = token.trim();
              if (trimmed && trimmed.length > 1) vocab.add(trimmed);
            });
          });
      });
    });
    return vocab;
  }

  function scoreConnectorAgainstPage(connector, forms, pageTitle) {
    const currentUrl = window.location.origin + window.location.pathname;
    
    // Check if connector has a form-url field that matches current URL
    const urlField = connector.fields?.find(f => f.id === 'form-url');
    if (urlField && urlField.value) {
      const connectorUrl = urlField.value;
      if (currentUrl === connectorUrl) {
        return true; // URL matches
      }
    }
    return false; // No URL match
  }

  async function getRankedConnectorsForCurrentPage() {
    await loadStoredData();
    const forms = await extractForms();
    const title = extractPageTitle();
    
    // Simple: only show connectors with matching form-url
    const matchingConnectors = credentialsData.filter(c => scoreConnectorAgainstPage(c, forms, title));
    
    console.log('QuickFill: Current URL:', window.location.origin + window.location.pathname);
    console.log('QuickFill: Matching connectors:', matchingConnectors);
    
    return { ranked: matchingConnectors, meta: { currentUrl: window.location.origin + window.location.pathname } };
  }

  function createSuggestionsContainer() {
    injectSuggestionStyles();
    if (suggestionsContainer) suggestionsContainer.remove();
    suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'quickfill-suggestions';
    suggestionsContainer.style.display = 'none';
    document.body.appendChild(suggestionsContainer);
    return suggestionsContainer;
  }

  function positionSuggestions(anchor) {
    if (!suggestionsContainer || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 6;
    const left = rect.left + window.scrollX;
    const width = Math.max(rect.width, 260);
    suggestionsContainer.style.top = `${top}px`;
    suggestionsContainer.style.left = `${left}px`;
    suggestionsContainer.style.minWidth = `${width}px`;
  }

  function hideSuggestions() {
    if (!suggestionsContainer) return;
    suggestionsContainer.style.display = 'none';
    suggestionsContainer.innerHTML = '';
    activeSuggestionIndex = -1;
    currentAnchorInput = null;
  }

  function updateActiveItem(index) {
    const items = suggestionsContainer.querySelectorAll('.quickfill-suggestion-item');
    items.forEach(el => el.classList.remove('active'));
    if (index >= 0 && index < items.length) {
      items[index].classList.add('active');
      activeSuggestionIndex = index;
    }
  }

  async function showConnectorSuggestions(anchorInput) {
    try {
      const { ranked } = await getRankedConnectorsForCurrentPage();
      console.log('QuickFill: Got ranked connectors:', ranked);
      console.log('QuickFill: Current URL:', window.location.origin + window.location.pathname);
      
      if (!ranked || ranked.length === 0) {
        console.log('QuickFill: No connectors with URL matches found');
        return;
      }

      createSuggestionsContainer();
      currentAnchorInput = anchorInput;
      positionSuggestions(anchorInput);

      const topN = ranked.slice(0, 7);
      console.log('QuickFill: Top connectors:', topN);
      const header = document.createElement('div');
      header.className = 'quickfill-suggestions-header';
      header.textContent = 'QuickFill suggestions';
      suggestionsContainer.appendChild(header);

      topN.forEach((connector, idx) => {
        const item = document.createElement('div');
        item.className = 'quickfill-suggestion-item';
        item.innerHTML = `
          <div style="width: 8px; height: 8px; border-radius: 2px; background: ${idx === 0 ? '#64ffda' : '#7b95d6'}"></div>
          <div>
            <div class="quickfill-suggestion-title">${connector.title}</div>
            <div class="quickfill-suggestion-sub">${connector.fields?.length || 0} fields</div>
          </div>
        `;
        item.addEventListener('mousedown', (e) => { // mousedown to trigger before blur
          e.preventDefault();
          hideSuggestions();
          processPage(connector.title);
        });
        suggestionsContainer.appendChild(item);
      });

      suggestionsContainer.style.display = 'block';
      updateActiveItem(0);
    } catch (e) {
      console.error('Suggestions error', e);
    }
  }

  // Event wiring for inputs
  function shouldTriggerForElement(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input') {
      const type = (el.type || 'text').toLowerCase();
      return ['text', 'email', 'password', 'search', 'url', 'tel', 'number'].includes(type);
    }
    return tag === 'textarea';
  }

  document.addEventListener('focusin', async (e) => {
    const target = e.target;
    if (!shouldTriggerForElement(target)) return;
    
    // Check if suggestions are enabled
    try {
      const result = await chrome.storage.sync.get(['suggestionsEnabled']);
      const suggestionsEnabled = result.suggestionsEnabled !== false; // default to true
      if (!suggestionsEnabled) return;
    } catch (err) {
      // If we can't access storage, don't show suggestions
      return;
    }
    
    showConnectorSuggestions(target);
  });

  document.addEventListener('keydown', (e) => {
    if (!suggestionsContainer || suggestionsContainer.style.display === 'none') return;
    if (!currentAnchorInput) return;
    const isForAnchor = document.activeElement === currentAnchorInput;
    if (!isForAnchor) return;
    const items = suggestionsContainer.querySelectorAll('.quickfill-suggestion-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateActiveItem(Math.min(activeSuggestionIndex + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateActiveItem(Math.max(activeSuggestionIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const el = items[activeSuggestionIndex] || items[0];
      if (el) el.dispatchEvent(new Event('mousedown'));
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  window.addEventListener('scroll', () => {
    if (!suggestionsContainer || suggestionsContainer.style.display === 'none') return;
    positionSuggestions(currentAnchorInput);
  }, true);

  window.addEventListener('resize', () => {
    if (!suggestionsContainer || suggestionsContainer.style.display === 'none') return;
    positionSuggestions(currentAnchorInput);
  });
  
  document.addEventListener('click', (e) => {
    if (!suggestionsContainer || suggestionsContainer.style.display === 'none') return;
    if (suggestionsContainer.contains(e.target) || e.target === currentAnchorInput) return;
    hideSuggestions();
  });


  
})();


