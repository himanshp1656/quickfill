
// Step 1: Extract the page title
(() => {
    let credentialsData = [];
    let geminiApiKey = '';

    // Load data from storage
    async function loadStoredData() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['connectors', 'geminiApiKey'], (result) => {
                credentialsData = result.connectors || [];
                geminiApiKey = result.geminiApiKey || '';
                console.log('Loaded from storage:', { credentialsData, geminiApiKey });
                resolve();
            });
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
        formsCount: forms.length
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
        // Use flexible matching like searchCredentialsByTitle but based on connectorName instead of title
        matchingCredentials = searchCredentialsByTitle(connectorName);
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
  

  
})();


