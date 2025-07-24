// Initialize the popup
document.addEventListener('DOMContentLoaded', function() {
  initializeTabs();
  loadApiKey();
  loadConnectors();
  setupEventListeners();
  setupSharingUI();
});

// Tab switching functionality
function initializeTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
      
      // Load connectors when switching to manage tab
      if (targetTab === 'manage') {
        loadConnectors();
      }
    });
  });
}

  // Setup all event listeners
function setupEventListeners() {
  // API Key management
  document.getElementById('saveApiKeyBtn').addEventListener('click', saveApiKey);
  
  // Import functionality
  document.getElementById('importJsonBtn').addEventListener('click', importConnectorFromJson);
  
  // Form fill functionality
  document.getElementById('inspectBtn').addEventListener('click', fillForm);
  
  // Connector management
  document.getElementById('addFieldBtn').addEventListener('click', addField);
  document.getElementById('saveConnectorBtn').addEventListener('click', saveConnector);
  document.getElementById('autoFetchBtn').addEventListener('click', autoFetchFields);
  
  // Export functionality
  document.getElementById('showExportInterface').addEventListener('click', showExportInterface);
  document.getElementById('exportSelectedConnectors').addEventListener('click', exportSelectedConnectors);
  document.getElementById('selectAllConnectors').addEventListener('click', selectAllConnectors);
  document.getElementById('deselectAllConnectors').addEventListener('click', deselectAllConnectors);
  document.getElementById('cancelExport').addEventListener('click', hideExportInterface);
  document.getElementById('copyExportedJson').addEventListener('click', copyExportedJson);
  
  // Remove field functionality (delegated event)
  document.getElementById('fieldsContainer').addEventListener('click', function(e) {
    if (e.target.classList.contains('remove-field')) {
      removeField(e.target);
    } else if (e.target.classList.contains('toggle-multiline')) {
      toggleMultiline(e.target);
    }
  });
  
  // Connector list management (delegated events)
  document.getElementById('connectorsList').addEventListener('click', function(e) {
    const connectorName = e.target.getAttribute('data-connector');
    
    if (e.target.classList.contains('edit-connector')) {
      editConnector(connectorName);
    } else if (e.target.classList.contains('delete-connector')) {
      deleteConnector(connectorName);
    }
  });
  

}

// API Key Management
async function loadApiKey() {
  const result = await chrome.storage.sync.get(['geminiApiKey']);
  if (result.geminiApiKey) {
    document.getElementById('apiKeyInput').value = result.geminiApiKey;
  }
}

async function saveApiKey() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  if (!apiKey) {
    showToast('error', 'Please enter an API key');
    return;
  }
  
  await chrome.storage.sync.set({ geminiApiKey: apiKey });
  showToast('success', 'API key saved successfully');
}

// Form fill functionality
async function fillForm() {
  const result = await chrome.storage.sync.get(['geminiApiKey']);
  if (!result.geminiApiKey) {
    showToast('error', 'Please save your Gemini API key first');
    return;
  }
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const connectorName = document.getElementById("connectorInput").value;
  
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
  
  chrome.tabs.sendMessage(tab.id, { connectorName });
}

// Dynamic field management
function addField() {
  const fieldsContainer = document.getElementById('fieldsContainer');
  const fieldRow = document.createElement('div');
  fieldRow.className = 'field-row';
  fieldRow.innerHTML = `
    <input type="text" placeholder="Field Name (e.g. hostname)" class="field-name" />
    <input type="text" placeholder="Field Value (use textarea for multiline)" class="field-value" />
    <button type="button" class="toggle-multiline" title="Convert to multiline">📝</button>
    <button type="button" class="remove-field danger">Remove</button>
  `;
  fieldsContainer.appendChild(fieldRow);
}

function removeField(button) {
  const fieldsContainer = document.getElementById('fieldsContainer');
  const fieldRows = fieldsContainer.querySelectorAll('.field-row');
  
  // Don't remove if it's the last field
  if (fieldRows.length > 1) {
    button.parentElement.remove();
  } else {
    showToast('error', 'At least one field is required');
  }
}

function toggleMultiline(button) {
  const fieldRow = button.parentElement;
  const valueField = fieldRow.querySelector('.field-value');
  const currentValue = valueField.value;
  
  if (valueField.tagName === 'INPUT') {
    // Convert to textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'field-value';
    textarea.placeholder = 'Field Value (multiline supported)';
    textarea.value = currentValue;
    textarea.style.minHeight = '80px';
    textarea.style.fontFamily = 'Courier New, monospace';
    textarea.style.fontSize = '12px';
    
    valueField.parentNode.replaceChild(textarea, valueField);
    button.textContent = '📄';
    button.title = 'Convert to single line';
  } else {
    // Convert to input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field-value';
    input.placeholder = 'Field Value';
    input.value = currentValue;
    
    valueField.parentNode.replaceChild(input, valueField);
    button.textContent = '📝';
    button.title = 'Convert to multiline';
  }
}

// Auto-fetch fields from current page
async function autoFetchFields() {
  const fetchStatus = document.getElementById('fetchStatus');
  const autoFetchBtn = document.getElementById('autoFetchBtn');
  
  try {
    // Show loading state
    fetchStatus.textContent = 'Fetching form fields from current page...';
    fetchStatus.className = 'fetch-status loading';
    autoFetchBtn.disabled = true;
    
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Inject content script and get form fields
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    
    // Send message to content script to extract form fields
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractFormFields' });
    
    if (response && response.fields && response.fields.length > 0) {
      // Clear existing fields except the first one
      const fieldsContainer = document.getElementById('fieldsContainer');
      fieldsContainer.innerHTML = '';
      
      // Add fields based on extracted form data
      response.fields.forEach(field => {
        const fieldRow = document.createElement('div');
        fieldRow.className = 'field-row';
        
        // Use the cleaned field name from content script
        const fieldName = field.cleanName || field.name || field.placeholder || field.label || field.id || 'field';
        
        fieldRow.innerHTML = `
          <input type="text" placeholder="Field Name (e.g. hostname)" class="field-name" value="${fieldName}" />
          <input type="text" placeholder="Field Value (use textarea for multiline)" class="field-value" />
          <button type="button" class="toggle-multiline" title="Convert to multiline">📝</button>
          <button type="button" class="remove-field danger">Remove</button>
        `;
        fieldsContainer.appendChild(fieldRow);
      });
      
      // Auto-populate connector name from page title
      let connectorName = response.pageTitle || 'New Connector';
      
      // Clean up connector name - extract relevant parts
      connectorName = connectorName
        .replace(/\s*[-|]\s*.*$/, '')  // Remove everything after dash or pipe
        .replace(/\s*(login|signin|sign in|connect|connection|admin|dashboard)\s*/gi, '')  // Remove common words
        .trim();
      
      if (!connectorName || connectorName.length < 3) {
        connectorName = 'New Connector';
      }
      
      document.getElementById('newConnectorName').value = connectorName;
      
      // Show success message
      fetchStatus.textContent = `✅ Found ${response.fields.length} form fields! Please fill in the values.`;
      fetchStatus.className = 'fetch-status success';
      
      showToast('success', `Auto-fetched ${response.fields.length} form fields!`);
      
    } else {
      // No fields found
      fetchStatus.textContent = '❌ No form fields found on this page.';
      fetchStatus.className = 'fetch-status error';
      showToast('error', 'No form fields found on current page');
    }
    
  } catch (error) {
    console.error('Error fetching form fields:', error);
    fetchStatus.textContent = '❌ Failed to fetch form fields. Make sure you\'re on a page with forms.';
    fetchStatus.className = 'fetch-status error';
    showToast('error', 'Failed to fetch form fields from current page');
  } finally {
    // Re-enable button
    autoFetchBtn.disabled = false;
    
    // Clear status after 5 seconds
    setTimeout(() => {
      fetchStatus.textContent = '';
      fetchStatus.className = 'fetch-status';
    }, 5000);
  }
}

// Connector management
async function saveConnector() {
  const connectorName = document.getElementById('newConnectorName').value.trim();
  if (!connectorName) {
    showToast('error', 'Please enter a connector name');
    return;
  }
  
  const fieldRows = document.querySelectorAll('.field-row');
  const fields = [];
  
  for (let row of fieldRows) {
    const fieldName = row.querySelector('.field-name').value.trim();
    const fieldValueElement = row.querySelector('.field-value');
    const fieldValue = fieldValueElement.value.trim();
    
    if (fieldName && fieldValue) {
      fields.push({
        id: fieldName,
        value: fieldValue,
        isMultiline: fieldValueElement.tagName === 'TEXTAREA'
      });
    }
  }
  
  if (fields.length === 0) {
    showToast('error', 'Please add at least one field with both name and value');
    return;
  }
  
  // Get existing connectors
  const result = await chrome.storage.sync.get(['connectors']);
  const connectors = result.connectors || [];
  
  // Check if connector already exists
  const existingIndex = connectors.findIndex(c => c.title.toLowerCase() === connectorName.toLowerCase());
  
  const newConnector = {
    title: connectorName,
    fields: fields
  };
  
  if (existingIndex >= 0) {
    // Update existing connector
    connectors[existingIndex] = newConnector;
    showToast('success', `Connector "${connectorName}" updated successfully`);
  } else {
    // Add new connector
    connectors.push(newConnector);
    showToast('success', `Connector "${connectorName}" added successfully`);
  }
  
  // Save back to storage
  await chrome.storage.sync.set({ connectors: connectors });
  
  // Clear form
  clearConnectorForm();
  
  // Reload connectors list
  loadConnectors();
}

function clearConnectorForm() {
  document.getElementById('newConnectorName').value = '';
  const fieldsContainer = document.getElementById('fieldsContainer');
  fieldsContainer.innerHTML = `
    <div class="field-row">
      <input type="text" placeholder="Field Name (e.g. hostname)" class="field-name" />
      <input type="text" placeholder="Field Value (use textarea for multiline)" class="field-value" />
      <button type="button" class="toggle-multiline" title="Convert to multiline">📝</button>
      <button type="button" class="remove-field danger">Remove</button>
    </div>
  `;
}

async function loadConnectors() {
  const result = await chrome.storage.sync.get(['connectors']);
  const connectors = result.connectors || [];
  
  const connectorsList = document.getElementById('connectorsList');
  
  if (connectors.length === 0) {
    connectorsList.innerHTML = '<div style="text-align: center; color: #b0b9d8; font-style: italic;">No connectors found. Add one above!</div>';
    return;
  }
  
  const html = connectors.map(connector => `
    <div class="connector-item">
      <div>
        <div class="connector-name">${connector.title}</div>
        <div style="font-size: 12px; color: #b0b9d8;">${connector.fields.length} fields</div>
      </div>
      <div>
        <button class="edit-connector" data-connector="${connector.title}">Edit</button>
        <button class="danger delete-connector" data-connector="${connector.title}">Delete</button>
      </div>
    </div>
  `).join('');
  
  connectorsList.innerHTML = html;
  
  console.log('Connectors loaded:', connectors.length, 'Share buttons should be visible');
}

// Show export interface
async function showExportInterface() {
  const result = await chrome.storage.sync.get(['connectors']);
  const connectors = result.connectors || [];
  
  if (connectors.length === 0) {
    showToast('error', 'No connectors to export');
    return;
  }
  
  // Populate checkboxes
  const checkboxContainer = document.getElementById('connectorCheckboxes');
  checkboxContainer.innerHTML = connectors.map(connector => `
    <div class="connector-option" style="display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: rgba(255, 255, 255, 0.03); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.05); transition: all 0.2s ease; cursor: pointer;">
      <div class="custom-checkbox" style="width: 20px; height: 20px; border: 2px solid #4c61af; border-radius: 4px; margin-right: 12px; display: flex; align-items: center; justify-content: center; background: rgba(76, 97, 175, 0.1); transition: all 0.2s ease;">
        <input type="checkbox" class="export-checkbox" data-connector="${connector.title}" style="display: none;">
        <span class="checkmark" style="color: white; font-size: 14px; font-weight: bold; opacity: 0; transition: opacity 0.2s ease;">✓</span>
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 500; color: #e0e6f1; font-size: 14px;">${connector.title}</div>
        <div style="font-size: 12px; color: #b0b9d8; margin-top: 2px;">${connector.fields.length} fields</div>
      </div>
    </div>
  `).join('');
  
  // Add event listeners for checkboxes and custom styling
  const checkboxes = checkboxContainer.querySelectorAll('.export-checkbox');
  const connectorOptions = checkboxContainer.querySelectorAll('.connector-option');
  
  checkboxes.forEach((checkbox, index) => {
    const option = connectorOptions[index];
    const customCheckbox = option.querySelector('.custom-checkbox');
    const checkmark = option.querySelector('.checkmark');
    
    // Handle checkbox change
    checkbox.addEventListener('change', () => {
      updateSelectedCount();
      updateCheckboxStyle(checkbox, customCheckbox, checkmark);
    });
    
    // Handle click on the entire option
    option.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });
    
    // Handle hover effects
    option.addEventListener('mouseenter', () => {
      option.style.background = 'rgba(255, 255, 255, 0.08)';
      option.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    });
    
    option.addEventListener('mouseleave', () => {
      option.style.background = 'rgba(255, 255, 255, 0.03)';
      option.style.borderColor = 'rgba(255, 255, 255, 0.05)';
    });
  });
  
  // Show interface
  document.getElementById('exportInterface').style.display = 'block';
  updateSelectedCount();
}

// Hide export interface
function hideExportInterface() {
  document.getElementById('exportInterface').style.display = 'none';
  document.getElementById('exportResult').style.display = 'none';
}

// Update selected count display
function updateSelectedCount() {
  const checkboxes = document.querySelectorAll('.export-checkbox:checked');
  const selectedCount = document.getElementById('selectedCount');
  selectedCount.textContent = `Selected: ${checkboxes.length} connector${checkboxes.length !== 1 ? 's' : ''}`;
}

// Update checkbox visual style
function updateCheckboxStyle(checkbox, customCheckbox, checkmark) {
  if (checkbox.checked) {
    customCheckbox.style.background = 'linear-gradient(90deg, #4c61af, #7b95d6)';
    customCheckbox.style.borderColor = '#7b95d6';
    checkmark.style.opacity = '1';
  } else {
    customCheckbox.style.background = 'rgba(76, 97, 175, 0.1)';
    customCheckbox.style.borderColor = '#4c61af';
    checkmark.style.opacity = '0';
  }
}

// Select all connectors
function selectAllConnectors() {
  const checkboxes = document.querySelectorAll('.export-checkbox');
  const customCheckboxes = document.querySelectorAll('.custom-checkbox');
  const checkmarks = document.querySelectorAll('.checkmark');
  
  checkboxes.forEach((checkbox, index) => {
    checkbox.checked = true;
    updateCheckboxStyle(checkbox, customCheckboxes[index], checkmarks[index]);
  });
  updateSelectedCount();
}

// Deselect all connectors
function deselectAllConnectors() {
  const checkboxes = document.querySelectorAll('.export-checkbox');
  const customCheckboxes = document.querySelectorAll('.custom-checkbox');
  const checkmarks = document.querySelectorAll('.checkmark');
  
  checkboxes.forEach((checkbox, index) => {
    checkbox.checked = false;
    updateCheckboxStyle(checkbox, customCheckboxes[index], checkmarks[index]);
  });
  updateSelectedCount();
}

async function deleteConnector(connectorName) {
  if (!confirm(`Are you sure you want to delete the "${connectorName}" connector?`)) {
    return;
  }
  
  const result = await chrome.storage.sync.get(['connectors']);
  const connectors = result.connectors || [];
  
  const filteredConnectors = connectors.filter(c => c.title !== connectorName);
  await chrome.storage.sync.set({ connectors: filteredConnectors });
  
  showToast('success', `Connector "${connectorName}" deleted successfully`);
  loadConnectors();
}

async function editConnector(connectorName) {
  const result = await chrome.storage.sync.get(['connectors']);
  const connectors = result.connectors || [];
  
  const connector = connectors.find(c => c.title === connectorName);
  if (!connector) return;
  
  // Switch to manage tab if not already there
  document.querySelector('.tab[data-tab="manage"]').click();
  
  // Fill the form with connector data
  document.getElementById('newConnectorName').value = connector.title;
  
  const fieldsContainer = document.getElementById('fieldsContainer');
  fieldsContainer.innerHTML = '';
  
  connector.fields.forEach(field => {
    const fieldRow = document.createElement('div');
    fieldRow.className = 'field-row';
    
    const isMultiline = field.isMultiline || field.value.includes('\n') || field.value.length > 100;
    const valueElement = isMultiline ? 
      `<textarea class="field-value" placeholder="Field Value (multiline supported)" style="min-height: 80px; font-family: Courier New, monospace; font-size: 12px;">${field.value}</textarea>` :
      `<input type="text" class="field-value" placeholder="Field Value (use textarea for multiline)" value="${field.value}" />`;
    
    fieldRow.innerHTML = `
      <input type="text" placeholder="Field Name (e.g. hostname)" class="field-name" value="${field.id}" />
      ${valueElement}
      <button type="button" class="toggle-multiline" title="${isMultiline ? 'Convert to single line' : 'Convert to multiline'}">${isMultiline ? '📄' : '📝'}</button>
      <button type="button" class="remove-field danger">Remove</button>
    `;
    fieldsContainer.appendChild(fieldRow);
  });
  
  showToast('success', `Loaded "${connectorName}" for editing`);
}

// Toast notification system
function showToast(type, message) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  const container = document.getElementById('toastContainer');
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}





// Import connector from JSON
async function importConnectorFromJson() {
  const jsonData = document.getElementById('importJson').value.trim();
  if (!jsonData) {
    showToast('error', 'Please paste connector data');
    return;
  }

  try {
    let data;
    
    // Try to decode as Base64 first
    try {
      const decodedData = atob(jsonData);
      data = JSON.parse(decodedData);
    } catch (base64Error) {
      // If Base64 fails, try as plain JSON
      data = JSON.parse(jsonData);
    }
    
    // Handle different export formats
    let connectorsToImport = [];
    
    if (data.connector) {
      // Single connector export format
      connectorsToImport = [data.connector];
    } else if (data.connectors && Array.isArray(data.connectors)) {
      // Multiple connectors export format
      connectorsToImport = data.connectors;
    } else if (data.title && data.fields && Array.isArray(data.fields)) {
      // Direct connector object format
      connectorsToImport = [data];
    } else {
      throw new Error('Invalid connector format - no valid connector data found');
    }
    
    // Validate all connectors
    for (let i = 0; i < connectorsToImport.length; i++) {
      const connector = connectorsToImport[i];
      if (!connector.title || !connector.fields || !Array.isArray(connector.fields)) {
        throw new Error(`Invalid connector format at index ${i}`);
      }
    }

    // Get existing connectors
    const result = await chrome.storage.sync.get(['connectors']);
    const existingConnectors = result.connectors || [];
    
    // Import all connectors
    let importedCount = 0;
    for (const connector of connectorsToImport) {
      // Handle naming conflicts
      let connectorName = connector.title;
      let counter = 1;
      while (existingConnectors.some(c => c.title === connectorName)) {
        connectorName = `${connector.title} (${counter})`;
        counter++;
      }
      
      // Add the imported connector
      const newConnector = {
        ...connector,
        title: connectorName
      };
      
      existingConnectors.push(newConnector);
      importedCount++;
    }
    
    // Save all connectors
    await chrome.storage.sync.set({ connectors: existingConnectors });
    
    // Clear the input
    document.getElementById('importJson').value = '';
    showToast('success', `Successfully imported ${importedCount} connector${importedCount > 1 ? 's' : ''}`);
    
    // Switch to manage tab to show the imported connector(s)
    document.querySelector('.tab[data-tab="manage"]').click();
  } catch (error) {
    showToast('error', 'Invalid connector data: ' + error.message);
    console.error('Import error:', error);
  }
}



// Export selected connectors
async function exportSelectedConnectors() {
  const selectedCheckboxes = document.querySelectorAll('.export-checkbox:checked');
  
  if (selectedCheckboxes.length === 0) {
    showToast('error', 'Please select at least one connector to export');
    return;
  }
  
  const result = await chrome.storage.sync.get(['connectors']);
  const allConnectors = result.connectors || [];
  const selectedConnectors = [];
  
  // Get selected connectors
  selectedCheckboxes.forEach(checkbox => {
    const connectorName = checkbox.getAttribute('data-connector');
    const connector = allConnectors.find(c => c.title === connectorName);
    if (connector) {
      selectedConnectors.push(connector);
    }
  });
  
  if (selectedConnectors.length === 0) {
    showToast('error', 'No valid connectors found');
    return;
  }
  
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    connectors: selectedConnectors
  };
  
  const jsonString = JSON.stringify(exportData, null, 2);
  const encodedString = btoa(jsonString);
  displayExportedJson(encodedString, jsonString);
  showToast('success', `Exported ${selectedConnectors.length} connector${selectedConnectors.length > 1 ? 's' : ''} (encoded)`);
}

// Display exported JSON
function displayExportedJson(encodedString, jsonString) {
  const exportResult = document.getElementById('exportResult');
  const exportedJson = document.getElementById('exportedJson');
  
  // Show encoded string by default (for sharing)
  exportedJson.value = encodedString;
  exportResult.style.display = 'block';
  
  // Add toggle button to switch between encoded and decoded
  const toggleButton = document.getElementById('toggleEncoded') || createToggleButton();
  toggleButton.onclick = () => {
    if (exportedJson.value === encodedString) {
      exportedJson.value = jsonString;
      toggleButton.textContent = 'Show Encoded';
    } else {
      exportedJson.value = encodedString;
      toggleButton.textContent = 'Show Decoded';
    }
  };
  
  // Scroll to export result
  exportResult.scrollIntoView({ behavior: 'smooth' });
}

// Create toggle button for encoded/decoded view
function createToggleButton() {
  const exportResult = document.getElementById('exportResult');
  const toggleButton = document.createElement('button');
  toggleButton.id = 'toggleEncoded';
  toggleButton.textContent = 'Show Decoded';
  toggleButton.style.marginLeft = '10px';
  
  // Insert after copy button
  const copyButton = document.getElementById('copyExportedJson');
  copyButton.parentNode.insertBefore(toggleButton, copyButton.nextSibling);
  
  return toggleButton;
}

// Copy exported JSON to clipboard
async function copyExportedJson() {
  const exportedJson = document.getElementById('exportedJson');
  
  try {
    await navigator.clipboard.writeText(exportedJson.value);
    showToast('success', 'JSON copied to clipboard');
  } catch (error) {
    // Fallback for older browsers
    exportedJson.select();
    document.execCommand('copy');
    showToast('success', 'JSON copied to clipboard');
  }
}
  