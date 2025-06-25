# 🚀 QuickFill - AI-Powered Form Auto-Fill Chrome Extension

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://github.com/yourusername/quickfill-extension)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/)
[![Gemini AI](https://img.shields.io/badge/Powered%20by-Gemini%20AI-FF6F00?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)

> **QuickFill** is an intelligent Chrome extension that automatically fills web forms using AI-powered field mapping. Store your credentials securely and let AI match them to any form on the web!

## ✨ Features

- 🤖 **AI-Powered Mapping**: Uses Google Gemini AI to intelligently match form fields with your stored credentials
- 🔐 **Secure Storage**: All data stored locally in Chrome's encrypted storage with cross-device sync
- 🎯 **Smart Detection**: Automatically detects forms and suggests relevant connectors
- 📝 **Multiline Support**: Perfect for private keys, certificates, and complex configurations
- 🎨 **Modern UI**: Beautiful, responsive interface with tabbed navigation
- 🔄 **CRUD Operations**: Create, read, update, and delete connectors with ease
- 🌐 **Universal**: Works on any website with forms
- 💾 **Persistent**: Your connectors and API key sync across all Chrome devices

## 🖼️ Screenshots
<img width="678" alt="Screenshot 2025-06-25 at 6 51 19 PM" src="https://github.com/user-attachments/assets/27c5d3b5-8c4e-41a8-b04a-7d30342c7e8c" />
<img width="678" alt="Screenshot 2025-06-25 at 6 51 37 PM" src="https://github.com/user-attachments/assets/9162360b-8755-4276-a809-29577aa2a6b9" />

### Main Interface
- **Use Extension Tab**: Enter connector name and auto-fill forms
- **Manage Connectors Tab**: Add, edit, and delete your connectors

### Connector Management
- Add unlimited field pairs per connector
- Toggle between single-line and multiline inputs
- Perfect for database connections, API credentials, and SSH keys

## 🚀 Installation

### Method 1: Install from Source (Recommended for Development)

1. **Download the Extension**
   ```bash
   git clone https://github.com/yourusername/quickfill-extension.git
   cd quickfill-extension
   ```

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or go to **Menu** → **More Tools** → **Extensions**

3. **Enable Developer Mode**
   - Toggle the **"Developer mode"** switch in the top-right corner

4. **Load the Extension**
   - Click **"Load unpacked"** button
   - Select the `quickfill-extension` folder you downloaded
   - The extension will appear in your extensions list

5. **Pin the Extension** (Optional)
   - Click the puzzle piece icon (🧩) in the Chrome toolbar
   - Find "QuickFill" and click the pin icon to keep it visible

### Method 2: Install from ZIP

1. **Download ZIP**
   - Download the repository as a ZIP file
   - Extract it to a folder on your computer

2. **Follow steps 2-5** from Method 1 above

## ⚙️ Setup & Configuration

### 1. Get Your Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy your API key (starts with `AIza...`)

### 2. Configure the Extension

1. **Click the QuickFill icon** in your Chrome toolbar
2. **Go to "API Configuration" section**
3. **Paste your API key** in the input field
4. **Click "Save API Key"**

### 3. Add Your First Connector

1. **Switch to "Manage Connectors" tab**
2. **Enter connector name** (e.g., "PostgreSQL Production")
3. **Add field pairs**:
   - Field Name: `hostname` → Value: `db.company.com`
   - Field Name: `username` → Value: `admin`
   - Field Name: `password` → Value: `your-password`
4. **Click "Save Connector"**

## 🎯 Usage

### Basic Auto-Fill

1. **Navigate to any form** (e.g., database connection page)
2. **Click the QuickFill extension icon**
3. **Enter connector name** or leave blank for auto-detection
4. **Click "Auto-Fill Form"**
5. **Watch the magic happen!** ✨

### Advanced Features

#### Multiline Values (Private Keys, Certificates)
1. **Add a new field**
2. **Click the 📝 button** to switch to textarea mode
3. **Paste your private key or certificate**
4. **Save the connector**

#### Managing Connectors
- **Edit**: Click "Edit" next to any connector to modify it
- **Delete**: Click "Delete" to remove a connector
- **View**: See all your connectors with field counts

## 📋 Supported Field Types

### Database Connectors
- Hostname, Port, Database name
- Username, Password
- Connection strings
- SSL certificates

### API Services
- API keys, Secret keys
- Endpoints, Tokens
- OAuth credentials
- Custom headers

### SSH/Server Access
- Hostnames, Ports
- Usernames, Passwords
- Private keys, Public keys
- SSH configurations

### Cloud Services
- AWS Access Keys, Secret Keys
- Azure credentials
- GCP service accounts
- Any cloud provider credentials

## 🗂️ File Structure

```
quickfill-extension/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality and connector management
├── content.js            # Content script for form detection and filling
├── icons/
│   └── magic-wand.png    # Extension icon
└── README.md             # This file
```

## 🔧 Technical Details

### Architecture
- **Manifest V3**: Latest Chrome extension standard
- **Chrome Storage API**: Secure, encrypted storage with sync
- **Gemini AI Integration**: Smart form field mapping
- **Content Script Injection**: Dynamic form analysis

### Storage
- **Type**: `chrome.storage.sync` (100KB limit)
- **Capacity**: ~100-300 connectors (depending on field size)
- **Sync**: Automatic across all Chrome devices
- **Security**: Encrypted by Chrome, tied to Google account

### Permissions
- `activeTab`: Access current tab for form detection
- `scripting`: Inject content scripts for form filling
- `storage`: Store connectors and API key securely

## 🛠️ Troubleshooting

### Common Issues

**❌ "No credentials found for this page"**
- Ensure you have connectors saved
- Try entering the exact connector name
- Check that field names match the form

**❌ "Gemini API key not found"**
- Make sure you've saved your API key
- Verify the API key is valid
- Check your Gemini AI quota

**❌ Forms not auto-filling**
- Refresh the page after adding connectors
- Ensure the form has proper field IDs
- Try manually entering the connector name

**❌ Extension not loading**
- Check Chrome Developer Mode is enabled
- Verify all files are in the extension folder
- Look for errors in Chrome Extensions page

### Debug Mode
1. Right-click the QuickFill icon → **"Inspect popup"**
2. Check the Console for error messages
3. Report issues with console logs

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
4. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open a Pull Request**

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Google Gemini AI** for intelligent form field mapping
- **Chrome Extensions API** for the robust platform
- **Community** for feedback and contributions

## 📞 Support
- **Email**: himanshu.pandey@atlan.com

---

<div align="center">

**⭐ If you find QuickFill helpful, please star this repository! ⭐**

Made with ❤️ for the developer community

</div> 
