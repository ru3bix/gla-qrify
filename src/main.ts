import { Html5QrcodeScanner } from 'html5-qrcode';
import { jwtDecode } from 'jwt-decode';

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Interface for the JWT claims structure
interface AttendeeClaims {
  full_name: string;
  has_dance_access: boolean;
  has_dinner_access: boolean;
  sub: string; // Subject (attendee ID)
  exp: number; // Expiration time
  iss: string; // Issuer
  iat: number; // Issued at time
}

// Interface for API response
interface APIResponse {
  message?: string;
  attendee_id?: string;
  attendee_name?: string;
  venue_entry_at?: string;
  refreshment_claimed_at?: string;
  dinner_claimed_at?: string;
  error?: string;
}

// QR Scanner instance
let qrScanner: Html5QrcodeScanner | null = null;

// Track if JWT has been scanned and store the token
let hasScannedJWT = false;
let currentJWTToken = '';
let currentAttendeeClaims: AttendeeClaims | null = null;

// API Base URL - adjust this based on your backend URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Update bottom action buttons state
function updateBottomActionButtons() {
  const actionButtons = document.getElementById('bottom-action-buttons');
  const acceptBtn = document.getElementById('accept-btn') as HTMLButtonElement;
  const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement;

  if (actionButtons && acceptBtn && rejectBtn) {
    if (hasScannedJWT) {
      acceptBtn.disabled = false;
      rejectBtn.disabled = false;

      // Update accept button text based on active tab
      const activeTab = getActiveTab();
      switch (activeTab) {
        case 'venue':
          acceptBtn.textContent = 'Accept Venue Entry';
          break;
        case 'refreshments':
          acceptBtn.textContent = 'Accept Refreshments';
          break;
        case 'dinner':
          acceptBtn.textContent = 'Accept Dinner';
          break;
        default:
          acceptBtn.textContent = 'Accept Entry';
      }
    } else {
      // actionButtons.classList.add('hidden');
      acceptBtn.disabled = true;
      rejectBtn.disabled = true;
    }
  }
}

// Get currently active tab
function getActiveTab(): string {
  const venueTab = document.getElementById('venue-tab');
  const refreshmentsTab = document.getElementById('refreshments-tab');
  const dinnerTab = document.getElementById('dinner-tab');

  if (venueTab?.classList.contains('active')) return 'venue';
  if (refreshmentsTab?.classList.contains('active')) return 'refreshments';
  if (dinnerTab?.classList.contains('active')) return 'dinner';

  return 'venue'; // default
}

// Initialize bottom action buttons
function initializeBottomActionButtons() {
  const acceptBtn = document.getElementById('accept-btn');
  const rejectBtn = document.getElementById('reject-btn');

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      if (hasScannedJWT) {
        handleAcceptEntry();
      }
    });
  }

  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => {
      if (hasScannedJWT) {
        handleRejectEntry();
      }
    });
  }

  updateBottomActionButtons();
}

// Reset scanner and UI state
function resetScanner() {
  // Hide JWT info and show scanner container
  const jwtInfoElement = document.getElementById('jwt-info');
  const scannerContainer = document.getElementById('qr-scanner-container');
  const actionResult = document.getElementById('action-result');

  if (jwtInfoElement) {
    jwtInfoElement.classList.add('hidden');
  }

  if (scannerContainer) {
    scannerContainer.classList.remove('hidden');
  }

  if (actionResult) {
    actionResult.classList.add('hidden');
  }

  hideError();

  // Reset JWT state
  hasScannedJWT = false;
  currentJWTToken = '';
  currentAttendeeClaims = null;
  updateBottomActionButtons();

  // Restart the scanner
  initializeQRScanner();
}

// Handle accept entry action
async function handleAcceptEntry() {
  if (!currentJWTToken || !currentAttendeeClaims) {
    displayActionResult('Error: No valid token found', 'error');
    return;
  }

  const activeTab = getActiveTab();
  let endpoint = '';
  let hasRequiredAccess = false;

  // Determine endpoint and check permissions based on active tab
  switch (activeTab) {
    case 'venue':
      endpoint = `${API_BASE_URL}/venue/dance`;
      hasRequiredAccess = currentAttendeeClaims.has_dance_access;
      break;
    case 'refreshments':
      endpoint = `${API_BASE_URL}/refreshment`;
      hasRequiredAccess = currentAttendeeClaims.has_dance_access;
      break;
    case 'dinner':
      endpoint = `${API_BASE_URL}/dinner`;
      hasRequiredAccess = currentAttendeeClaims.has_dinner_access;
      break;
    default:
      displayActionResult('Error: Invalid tab selection', 'error');
      return;
  }

  // Check if user has required access
  if (!hasRequiredAccess) {
    const accessType = activeTab === 'dinner' ? 'dinner' : 'dance';
    displayActionResult(`Error: Attendee does not have ${accessType} access`, 'error');
    return;
  }

  try {
    // Disable buttons during request
    const acceptBtn = document.getElementById('accept-btn') as HTMLButtonElement;
    const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement;
    if (acceptBtn) acceptBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    displayActionResult('Processing entry...', 'loading');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentJWTToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data: APIResponse = await response.json();

    if (response.ok && data.message) {
      displayActionResult(data.message, 'success');
      // Auto-reset after 3 seconds
      setTimeout(() => {
        resetScanner();
      }, 500);
    } else {
      displayActionResult(data.error || 'Unknown error occurred', 'error');
      // Re-enable buttons on error
      if (acceptBtn) acceptBtn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
    }
  } catch (error) {
    console.error('API Error:', error);
    displayActionResult('Network error: Unable to process entry', 'error');
    // Re-enable buttons on error
    const acceptBtn = document.getElementById('accept-btn') as HTMLButtonElement;
    const rejectBtn = document.getElementById('reject-btn') as HTMLButtonElement;
    if (acceptBtn) acceptBtn.disabled = false;
    if (rejectBtn) rejectBtn.disabled = false;
  }
}

// Handle reject entry action
function handleRejectEntry() {
  displayActionResult('Entry rejected by staff member', 'rejected');
  // Auto-reset after 2 seconds
  setTimeout(() => {
    resetScanner();
  }, 500);
}

// Navigation tab functionality
function initializeNavigation() {
  // Get all tab buttons
  const tabButtons = document.querySelectorAll('.tab-button');

  // Add click event listener to each tab button
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons
      tabButtons.forEach(btn => btn.classList.remove('active'));

      // Add active class to the clicked button
      button.classList.add('active');

      // Update action buttons when tab changes
      updateBottomActionButtons();
    });
  });
}

// Initialize QR Code Scanner
function initializeQRScanner() {
  const qrReaderElement = document.getElementById('qr-reader');
  const resultsElement = document.getElementById('qr-reader-results');

  if (!qrReaderElement || !resultsElement) {
    console.error('QR reader elements not found');
    return;
  }

  // Configuration for the scanner
  const config = {
    fps: 10,
    qrbox: {
      width: 280,
      height: 280
    },
    aspectRatio: 1.0,
    videoConstraints: {
      facingMode: "environment" // Use back camera on mobile
    },
    showTorchButtonIfSupported: true,
    showZoomSliderIfSupported: true,
    rememberLastUsedCamera: true,
    supportedScanTypes: []
  };

  // Create the scanner
  qrScanner = new Html5QrcodeScanner("qr-reader", config, false);

  // Success callback
  const onScanSuccess = (decodedText: string, _decodedResult: any) => {
    console.log(`QR Code detected: ${decodedText}`);

    // Update results display
    resultsElement.innerHTML = `
      <div class="text-rose-pine-foam font-semibold">
        ✓ QR Code Scanned Successfully
      </div>
    `;

    // Try to parse as JWT
    parseJWT(decodedText);

    const selectionElement = document.getElementById('html5-qrcode-select-camera') as HTMLSelectElement;
    selectionElement.parentElement?.classList.add('hidden');

    // Stop the scanner after successful scan
    if (qrScanner) {
      qrScanner.clear();
    }
  };

  // Error callback
  const onScanFailure = (_error: string) => {
    // Don't log scanning errors as they're frequent and normal
    // console.warn(`QR Code scan error: ${error}`);
      const selectionElement = document.getElementById('html5-qrcode-select-camera') as HTMLSelectElement;
      selectionElement.parentElement?.classList.add('hidden');
  };

  // Start scanning immediately
  qrScanner.render(onScanSuccess, onScanFailure);
}

// Parse JWT token
function parseJWT(token: string) {
  try {
    // Decode the JWT without verification
    const decoded = jwtDecode<AttendeeClaims>(token);

    console.log('Decoded JWT:', decoded);

    // Check if the issuer is "kush"
    if (decoded.iss !== 'kush') {
      displayError(`Invalid issuer: ${decoded.iss}. Expected "kush".`);
      return;
    }

    // Store the token and claims
    currentJWTToken = token;
    currentAttendeeClaims = decoded;

    // Display the JWT information
    displayJWTInfo(decoded, token);

    // Mark that we have successfully scanned a JWT
    hasScannedJWT = true;
    updateBottomActionButtons();

  } catch (error) {
    console.error('Error parsing JWT:', error);
    displayError('Invalid JWT token format');
  }
}

// Display JWT information
function displayJWTInfo(claims: AttendeeClaims, rawToken: string) {
  const jwtInfoElement = document.getElementById('jwt-info');
  const jwtDetailsElement = document.getElementById('jwt-details');
  const scannerContainer = document.getElementById('qr-scanner-container');

  if (!jwtInfoElement || !jwtDetailsElement) {
    console.error('JWT info elements not found');
    return;
  }

  // Hide the scanner container and show JWT info in the same space
  if (scannerContainer) {
    scannerContainer.classList.add('hidden');
  }

  jwtDetailsElement.innerHTML = `
    <div class="space-y-4">
      <div class="border-b border-rose-pine-muted pb-3">
        <span class="text-rose-pine-gold font-semibold text-lg">Attendee Name:</span>
        <div class="text-rose-pine-text text-2xl font-bold mt-1">${claims.full_name}</div>
      </div>

      <div class="border-b border-rose-pine-muted pb-3">
        <span class="text-rose-pine-gold font-semibold text-lg">Attendee ID:</span>
        <div class="text-rose-pine-text text-2xl font-bold mt-1">${claims.sub}</div>
      </div>
      
      <div class="border-b border-rose-pine-muted pb-3">
        <span class="text-rose-pine-gold font-semibold text-lg">Dance Access:</span>
        <div class="${claims.has_dance_access ? 'text-rose-pine-foam' : 'text-rose-pine-love'} font-bold text-xl mt-1">
          ${claims.has_dance_access ? 'Granted' : 'Denied'}
        </div>
      </div>
      
      <div class="border-b border-rose-pine-muted pb-3">
        <span class="text-rose-pine-gold font-semibold text-lg">Dinner Access:</span>
        <div class="${claims.has_dinner_access ? 'text-rose-pine-foam' : 'text-rose-pine-love'} font-bold text-xl mt-1">
          ${claims.has_dinner_access ? 'Granted' : 'Denied'}
        </div>
      </div>
    </div>

    <div class="mt-4">
      <details class="bg-rose-pine-overlay rounded-lg">
        <summary class="cursor-pointer p-3 text-rose-pine-gold font-semibold">
          View Raw JWT Token
        </summary>
        <div class="p-3 pt-0">
          <textarea 
            readonly 
            class="w-full h-32 bg-rose-pine-base text-rose-pine-text text-xs font-mono p-2 rounded border border-rose-pine-muted resize-none"
            placeholder="JWT token will appear here..."
          >${rawToken}</textarea>
        </div>
      </details>
    </div>
  `;

  // Show the JWT info section
  jwtInfoElement.classList.remove('hidden');

  // Add event listener for scan again button
  const scanAgainBtn = document.getElementById('scan-again-btn');
  if (scanAgainBtn) {
    scanAgainBtn.addEventListener('click', () => {
      resetScanner();
    });
  }

  // No need to scroll - the content appears in the same location
}

// Display error message
function displayError(message: string) {
  const resultsElement = document.getElementById('qr-reader-results');
  if (resultsElement) {
    resultsElement.innerHTML = `
      <div class="text-rose-pine-love font-semibold">
        ${message}
      </div>
      <button 
        id="retry-scan-btn" 
        class="mt-3 bg-rose-pine-gold text-rose-pine-base py-2 px-4 rounded font-semibold hover:bg-opacity-80 transition-colors duration-200"
      >
        Try Again
      </button>
    `;

    // Add event listener for retry button
    const retryBtn = document.getElementById('retry-scan-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        resetScanner();
      });
    }
  }
}

// Display action result
function displayActionResult(message: string, type: 'success' | 'error' | 'loading' | 'rejected') {
  const actionResult = document.getElementById('action-result');
  const actionContent = document.getElementById('action-content');

  if (!actionResult || !actionContent) {
    console.error('Action result elements not found');
    return;
  }

  let bgColor = '';
  let textColor = '';
  let icon = '';

  switch (type) {
    case 'success':
      bgColor = 'bg-rose-pine-pine';
      textColor = 'text-white';
      icon = '✅';
      break;
    case 'error':
      bgColor = 'bg-rose-pine-love';
      textColor = 'text-white';
      icon = '❌';
      break;
    case 'loading':
      bgColor = 'bg-rose-pine-foam';
      textColor = 'text-white';
      icon = '⏳';
      break;
    case 'rejected':
      bgColor = 'bg-rose-pine-love';
      textColor = 'text-white';
      icon = '🚫';
      break;
  }

  actionContent.innerHTML = `
    <div class="${bgColor} ${textColor} p-6 rounded-lg text-center">
      <div class="text-4xl mb-4">${icon}</div>
      <div class="text-xl font-semibold">${message}</div>
    </div>
  `;

  actionResult.classList.remove('hidden');

  // Hide JWT info when showing action result
  const jwtInfo = document.getElementById('jwt-info');
  if (jwtInfo) {
    jwtInfo.classList.add('hidden');
  }
}

// Hide error messages
function hideError() {
  const resultsElement = document.getElementById('qr-reader-results');
  if (resultsElement) {
    resultsElement.innerHTML = 'Point your camera at a QR code to scan';
    resultsElement.className = 'mt-4 text-center text-rose-pine-subtle text-sm sm:text-base';
  }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeNavigation();
  initializeBottomActionButtons();
  initializeQRScanner();
});
