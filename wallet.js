// --- Viem Imports ---
// We are using an ES Module CDN (esm.sh) to import Viem functions directly.
// This is a modern approach that avoids global variables.
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  isAddress,
} from 'https://esm.sh/viem';
import { sepolia } from 'https://esm.sh/viem/chains';
import {
  generatePrivateKey,
  privateKeyToAccount,
} from 'https://esm.sh/viem/accounts';


// --- DOM Elements ---
const addressSpan = document.getElementById('address');
const privateKeySpan = document.getElementById('privateKey');
const balanceSpan = document.getElementById('balance');
const toInput = document.getElementById('to');
const amountInput = document.getElementById('amount');
const txStatusP = document.getElementById('txStatus');
const sendEthBtn = document.getElementById('sendEthBtn');
const gasFeeSpan = document.getElementById('gasFee');
const ensResolvedAddressP = document.getElementById('ensResolvedAddress'); // ADD to your HTML: A <p> tag to show the resolved ENS address.
const logoutBtn = document.getElementById('logoutBtn'); // ADD to your HTML: A <button> for logging out.
const generateWalletBtn = document.getElementById('generateWalletBtn'); // Reference to create wallet button
// Modal elements
const importModal = document.getElementById('importModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const importPrivateKeyInput = document.getElementById('importPrivateKeyInput');
// History elements
const historyCard = document.getElementById('historyCard');
const txList = document.getElementById('txList');
// Address Book elements
const addressBookModal = document.getElementById('addressBookModal');
const closeAddressBookModalBtn = document.getElementById('closeAddressBookModalBtn');
const contactList = document.getElementById('contactList');
const contactNameInput = document.getElementById('contactNameInput');
const contactAddressInput = document.getElementById('contactAddressInput');

// --- Viem Client Setup ---
// Public Client: For reading data from the blockchain (e.g., getting balance).
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(), // Uses a default public RPC for Sepolia
});

// --- Etherscan API Setup ---
// IMPORTANT: Replace with your own free API key from https://etherscan.io/apis
const ETHERSCAN_API_KEY = 'YOUR_ETHERSCAN_API_KEY';

// --- App State & Constants ---
const ADDRESS_BOOK_STORAGE_KEY = 'miniWalletAddressBook';
const WALLET_STORAGE_KEY = 'miniWalletSessionKey'; // For session persistence
let estimatedGasCost = 0n; // Store as BigInt in Wei
let addressBook = [];
// A variable to hold our account instance (from a private key)
let account;
// Wallet Client: For writing data to the blockchain (e.g., sending transactions).
// This will be created once we have an account.
let walletClient;
// A variable to hold our balance refresh interval
let balanceInterval;

/**
 * --- UI Helpers ---
 */

/**
 * Displays a toast notification at the bottom-right of the screen.
 * @param {string} message The message to display.
 * @param {'info' | 'success' | 'error'} type The type of toast.
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Animate the toast in
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);

  // Hide and remove the toast after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3000);
}

/**
 * Shows a validation error message for a given input field.
 * @param {HTMLInputElement} inputElement The input element to validate.
 * @param {string} message The error message to display.
 */
function showValidationError(inputElement, message) {
  const formGroup = inputElement.closest('.form-group');
  if (!formGroup) return;
  const errorElement = formGroup.querySelector('.validation-error');
  if (errorElement) {
    errorElement.textContent = message;
  }
  formGroup.classList.add('invalid');
}

/**
 * Clears the validation error state for a given input field.
 * @param {HTMLInputElement} inputElement The input element to clear.
 */
function clearValidationError(inputElement) {
  const formGroup = inputElement.closest('.form-group');
  if (formGroup) formGroup.classList.remove('invalid');
}

/**
 * Updates the entire UI with the details of a new or imported wallet.
 * @param {import('viem').PrivateKeyAccount} newAccount The account instance to display.
 * @param {string} [privateKey] The private key if the account was just generated.
 */
async function updateWalletUI(newAccount, privateKey) {
  // Clear any existing balance refresh interval to prevent multiple timers
  if (balanceInterval) {
    clearInterval(balanceInterval);
  }

  // If a private key is provided (i.e., on generate), store it in session storage.
  // In a real-world app, this should be encrypted with a user-provided password.
  if (privateKey) {
    sessionStorage.setItem(WALLET_STORAGE_KEY, privateKey);
  }

  account = newAccount;

  // Create a Wallet Client to send transactions with this account
  walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });

  // Update the UI with the new wallet's details
  addressSpan.textContent = account.address;
  // For imported wallets, we don't display the private key for security.
  privateKeySpan.textContent = privateKey ? privateKey : 'Imported (hidden)';
  balanceSpan.textContent = 'Fetching...'; // Give immediate feedback

  // Show the main wallet interface and hide the initial prompt
  const walletDashboard = document.getElementById('wallet-dashboard');
  const initialPrompt = document.getElementById('initial-prompt');
  if (walletDashboard) {
    walletDashboard.style.display = 'block';
  }
  if (initialPrompt) {
    initialPrompt.style.display = 'none';
  }

  console.log("Wallet loaded successfully!");
  console.log("Address:", account.address);

  // Fetch and display the balance
  await updateBalance();

  // Fetch and display transaction history
  await displayTransactionHistory();

  // Start a new interval to refresh the balance every 15 seconds
  balanceInterval = setInterval(updateBalance, 15000);

  // Clear the send form
  clearSendForm();
}

/**
 * Generates a new Ethereum wallet and updates the UI.
 */
async function generateWallet() {
  try {
    const privateKey = generatePrivateKey();
    const newAccount = privateKeyToAccount(privateKey);
    await updateWalletUI(newAccount, privateKey);
    showToast('New wallet created successfully!', 'success');
  } catch (error) {
    console.error("Error generating wallet:", error);
    showToast("Could not generate wallet. See console.", 'error');
  }
}

/**
 * Imports a wallet from a private key and updates the UI.
 */
async function importWallet() {
  const pk = importPrivateKeyInput.value;
  clearValidationError(importPrivateKeyInput); // Clear previous errors
  if (!pk || !pk.startsWith('0x')) {
    showValidationError(importPrivateKeyInput, 'Please enter a valid private key (starting with 0x).');
    return;
  }

  try {
    // Viem will throw an error if the private key format is invalid
    const newAccount = privateKeyToAccount(pk);
    sessionStorage.setItem(WALLET_STORAGE_KEY, pk); // Save imported key to session
    await updateWalletUI(newAccount);
    closeModal(); // Close the modal on success
    showToast('Wallet imported successfully!', 'success');
  } catch (error) {
    console.error("Error importing wallet:", error);
    showValidationError(importPrivateKeyInput, 'Invalid private key format.');
  } finally {
    // Clear the input field for security
    importPrivateKeyInput.value = '';
  }
}

/**
 * Fetches the balance for the current wallet and updates the UI.
 */
async function updateBalance() {
  if (!account) {
    return; // No wallet generated yet
  }
  // Add visual feedback for refreshing
  balanceSpan.classList.add('refreshing');

  try {
    const balance = await publicClient.getBalance({
      address: account.address,
    });
    const faucetInfo = document.getElementById('faucet-info');

    // Format the balance from Wei to Ether and display it
    balanceSpan.textContent = `${formatEther(balance)} ETH`;

    // Show faucet info if balance is zero
    if (faucetInfo) {
      faucetInfo.style.display = (balance === 0n) ? 'block' : 'none';
    }
  } catch (error) {
    console.error("Could not fetch balance:", error);
    balanceSpan.textContent = 'Error fetching balance';
  } finally {
    // Remove visual feedback once the fetch is complete
    balanceSpan.classList.remove('refreshing');
  }
}

/**
 * Fetches and displays the transaction history for the current account.
 */
async function displayTransactionHistory() {
  if (!account) return;

  historyCard.style.display = 'block';
  txList.innerHTML = '<p>Loading history...</p>';

  if (ETHERSCAN_API_KEY === 'W2SS691E3NKUTZGXV4YHF56VM**67WR5U7CF') {
    txList.innerHTML = '<p>Please add an Etherscan API key in wallet.js to view history.</p>';
    return;
  }

  try {
    const apiUrl = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${account.address}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.status !== '1') {
      // Etherscan API returns status '0' if there are no transactions
      if (data.message === 'No transactions found') {
        txList.innerHTML = '<p>No transactions found for this address.</p>';
      } else {
        throw new Error(data.message || 'Could not fetch history.');
      }
      return;
    }

    // Clear the loading message
    txList.innerHTML = '';
    const transactions = data.result;

    // Display the latest 15 transactions
    transactions.slice(0, 15).forEach(tx => {
      const isOut = tx.from.toLowerCase() === account.address.toLowerCase();
      const direction = isOut ? 'OUT' : 'IN';
      const counterparty = isOut ? tx.to : tx.from;
      const value = formatEther(tx.value);

      const txItem = document.createElement('div');
      txItem.className = 'tx-item';

      const explorerUrl = `${publicClient.chain.blockExplorers.default.url}/tx/${tx.hash}`;

      txItem.innerHTML = `
        <div class="tx-details">
          <span class="tx-direction tx-direction-${direction.toLowerCase()}">${direction}</span>
          <div>
            <div><strong>${parseFloat(value).toFixed(5)} ETH</strong></div>
            <div class="tx-address">${isOut ? 'To' : 'From'}: ${truncateAddress(counterparty)}</div>
          </div>
        </div>
        <div class="tx-link">
          <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer">Details ↗</a>
        </div>
      `;
      txList.appendChild(txItem);
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    txList.innerHTML = '<p>Could not load transaction history.</p>';
  }
}

/** Validates the amount in the "Send" form. */
function validateAmount() {
  const amountValue = amountInput.value;
  const amountNum = parseFloat(amountValue);
  if (!amountValue || isNaN(amountNum) || amountNum <= 0) {
    showValidationError(amountInput, 'Please enter a valid amount greater than 0.');
    return false;
  } else {
    clearValidationError(amountInput);
    return true;
  }
}

/**
 * Resolves an ENS name to an address or validates a regular address.
 * @returns {Promise<string|null>} The resolved Ethereum address or null if invalid.
 */
async function getRecipientAddress() {
  const toValue = toInput.value.trim();
  if (ensResolvedAddressP) ensResolvedAddressP.textContent = ''; // Clear previous
  clearValidationError(toInput);

  if (toValue.endsWith('.eth')) {
    if (ensResolvedAddressP) ensResolvedAddressP.textContent = 'Resolving ENS name...';
    try {
      const resolvedAddress = await publicClient.getEnsAddress({ name: toValue });
      if (resolvedAddress) {
        if (ensResolvedAddressP) ensResolvedAddressP.textContent = `Resolved: ${truncateAddress(resolvedAddress)}`;
        return resolvedAddress;
      } else {
        throw new Error('ENS name not found.');
      }
    } catch (e) {
      if (ensResolvedAddressP) ensResolvedAddressP.textContent = '';
      showValidationError(toInput, e.message || 'Could not resolve ENS name.');
      return null;
    }
  } else if (isAddress(toValue)) {
    return toValue;
  } else {
    showValidationError(toInput, 'Please enter a valid address or ENS name.');
    return null;
  }
}

/**
 * Estimates the gas fee for the current transaction details and updates the UI.
 */
async function updateAndShowGasEstimate() {
  gasFeeSpan.textContent = 'Estimating...';
  const to = await getRecipientAddress();

  if (!account || !to || !validateAmount()) {
    gasFeeSpan.textContent = '-';
    estimatedGasCost = 0n;
    return;
  }

  try {
    const amount = amountInput.value;
    const value = parseEther(amount);
    const gas = await publicClient.estimateGas({
      account,
      to,
      value,
    });
    const gasPrice = await publicClient.getGasPrice();
    estimatedGasCost = gas * gasPrice;
    gasFeeSpan.textContent = `${formatEther(estimatedGasCost)}`;
  } catch (error) {
    console.error("Gas estimation failed:", error);
    gasFeeSpan.textContent = 'Unavailable';
    estimatedGasCost = 0n;
  }
}

function clearSendForm() {
  toInput.value = '';
  amountInput.value = '';
  txStatusP.innerHTML = '';
  if (ensResolvedAddressP) ensResolvedAddressP.textContent = '';
  gasFeeSpan.textContent = '-';
  clearValidationError(toInput);
  clearValidationError(amountInput);
}
/**
 * --- Address Book Functions ---
 */
function loadAddressBook() {
  const stored = localStorage.getItem(ADDRESS_BOOK_STORAGE_KEY);
  addressBook = stored ? JSON.parse(stored) : [];
}

function saveAddressBook() {
  localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify(addressBook));
}

function renderAddressBook() {
  contactList.innerHTML = '';
  if (addressBook.length === 0) {
    contactList.innerHTML = '<p>No contacts saved yet.</p>';
    return;
  }

  addressBook.forEach(contact => {
    const item = document.createElement('div');
    item.className = 'contact-item';
    item.innerHTML = `
      <div class="contact-info">
        <div class="name">${contact.name}</div>
        <div class="address">${truncateAddress(contact.address)}</div>
      </div>
      <div class="contact-actions">
        <button class="select-contact-btn" data-address="${contact.address}">Select</button>
        <button class="delete-contact-btn delete" data-address="${contact.address}">Delete</button>
      </div>
    `;
    contactList.appendChild(item);
  });
}

function addContact() {
  const name = contactNameInput.value.trim();
  const address = contactAddressInput.value.trim();

  // Clear previous errors
  clearValidationError(contactNameInput);
  clearValidationError(contactAddressInput);

  let isFormValid = true;

  if (!name) {
    showValidationError(contactNameInput, 'Name cannot be empty.');
    isFormValid = false;
  }

  if (!isAddress(address)) {
    showValidationError(contactAddressInput, 'Please enter a valid Ethereum address.');
    isFormValid = false;
  } else if (addressBook.some(c => c.address.toLowerCase() === address.toLowerCase())) {
    showValidationError(contactAddressInput, 'This address is already in your book.');
    isFormValid = false;
  }

  if (!isFormValid) return;

  addressBook.push({ name, address });
  saveAddressBook();
  renderAddressBook();
  showToast('Contact added!', 'success');

  // Clear inputs
  contactNameInput.value = '';
  contactAddressInput.value = '';
}

function handleContactListClick(event) {
  const target = event.target;
  const address = target.dataset.address;

  if (!address) return;

  if (target.classList.contains('select-contact-btn')) {
    toInput.value = address;
    closeAddressBookModal();
    showToast('Recipient address populated.', 'success');
  } else if (target.classList.contains('delete-contact-btn')) {
    if (confirm('Are you sure you want to delete this contact?')) {
      addressBook = addressBook.filter(c => c.address !== address);
      saveAddressBook();
      renderAddressBook();
      showToast('Contact deleted.', 'info');
    }
  }
}

function truncateAddress(address) {
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Copies the wallet address to the clipboard.
 * Provides visual feedback on the button itself.
 * @param {MouseEvent} event The click event from the button.
 */
function copyAddress(event) {
  const address = addressSpan.textContent;
  const copyButton = event.currentTarget;

  if (address && address !== '-') {
    navigator.clipboard.writeText(address).then(() => {
      // Provide visual feedback on the button
      const originalText = copyButton.innerHTML;
      copyButton.innerHTML = 'Copied! ✅';
      copyButton.disabled = true;

      setTimeout(() => {
        copyButton.innerHTML = originalText;
        copyButton.disabled = false;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy address: ', err);
      showToast('Failed to copy address.', 'error');
    });
  }
}

/**
 * Sends ETH from the current wallet to a specified address.
 */
async function sendETH() {
  if (!walletClient || !account) {
    showToast('Please create or import a wallet first.', 'info');
    return;
  }

  // --- Pre-flight Checks (Validation and Balance) ---
  try {
    const recipientAddress = await getRecipientAddress();
    if (!recipientAddress || !validateAmount()) {
      return; // Stop if address or amount is invalid
    }

    const amountInWei = parseEther(amountInput.value);
    const totalCost = amountInWei + estimatedGasCost;
    const balance = await publicClient.getBalance({ address: account.address });

    if (balance < totalCost) {
      showToast(`Insufficient funds. Total cost is approx. ${formatEther(totalCost)} ETH.`, 'error');
      return;
    }
  } catch (error) {
    // This can happen if the amount is not a valid number (e.g., contains letters)
    showToast('Invalid amount entered.', 'error');
    console.error("Error parsing amount or fetching balance:", error);
    return;
  }

  // Disable button to prevent multiple clicks
  sendEthBtn.disabled = true;
  sendEthBtn.textContent = 'Sending...';
  txStatusP.innerHTML = ''; // Clear previous status

  try {
    const to = await getRecipientAddress(); // Re-resolve to be safe
    const txHash = await walletClient.sendTransaction({
      to,
      value: parseEther(amountInput.value),
    });

    const explorerUrl = `${publicClient.chain.blockExplorers.default.url}/tx/${txHash}`;
    txStatusP.innerHTML = `Transaction sent! Waiting for confirmation... <a href="${explorerUrl}" target="_blank">View on Explorer</a>`;

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === 'success') {
      txStatusP.innerHTML = `Transaction confirmed! ✅ <a href="${explorerUrl}" target="_blank">View on Explorer</a>`;
      showToast('Transaction successful!', 'success');
    } else {
      txStatusP.innerHTML = `Transaction failed. ❌ <a href="${explorerUrl}" target="_blank">View on Explorer</a>`;
      showToast('Transaction failed to confirm.', 'error');
    }

    updateBalance(); // Update balance after sending
    displayTransactionHistory(); // Refresh history after sending
    clearSendForm(); // Clear inputs after successful transaction
  } catch (error) {
    console.error('Transaction failed:', error);
    txStatusP.textContent = `Error: ${error.message}`;
    showToast(error.shortMessage || 'Transaction failed.', 'error');
  } finally {
    // Re-enable the button
    sendEthBtn.disabled = false;
    sendEthBtn.textContent = '🚀 Send';
  }
}

/**
 * --- Wallet State Management ---
 */

/**
 * Loads a wallet from a private key stored in sessionStorage.
 */
async function loadWalletFromStorage() {
  const pk = sessionStorage.getItem(WALLET_STORAGE_KEY);
  if (pk) {
    try {
      console.log("Found wallet in session, loading...");
      const savedAccount = privateKeyToAccount(pk);
      await updateWalletUI(savedAccount);
    } catch (error) {
      console.error("Failed to load wallet from session storage:", error);
      sessionStorage.removeItem(WALLET_STORAGE_KEY); // Clear invalid key
    }
  }
}

/**
 * Clears wallet state from memory and storage, resetting the UI.
 */
function logout() {
  sessionStorage.removeItem(WALLET_STORAGE_KEY);
  // Using window.location.reload() is a simple way to reset all state
  window.location.reload();
  showToast('Wallet cleared from session.', 'info');
}

/**
 * --- Modal Controls ---
 */
function openModal() {
  if (importModal) importModal.classList.add('show');
}

function closeModal() {
  if (importModal) {
    importModal.classList.remove('show');
    // Clear validation on close
    clearValidationError(importPrivateKeyInput);
  }
}

function openAddressBookModal() {
  renderAddressBook(); // Re-render every time it's opened
  if (addressBookModal) addressBookModal.classList.add('show');
}

function closeAddressBookModal() {
  if (addressBookModal) {
    addressBookModal.classList.remove('show');
    // Clear validation on close
    clearValidationError(contactNameInput);
    clearValidationError(contactAddressInput);
  }
}
/**
 * --- Utilities ---
 */

/**
 * Debounces a function to limit how often it can be executed.
 */
function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}
/**
 * --- Event Listeners ---
 */
if (generateWalletBtn) {
  generateWalletBtn.addEventListener('click', generateWallet);
}
document.getElementById('copyAddressBtn').addEventListener('click', copyAddress);
sendEthBtn.addEventListener('click', sendETH);
if (logoutBtn) logoutBtn.addEventListener('click', logout);

// Modal event listeners
document.getElementById('openImportModalBtn').addEventListener('click', openModal);
document.getElementById('importWalletBtn').addEventListener('click', importWallet);
closeModalBtn.addEventListener('click', closeModal);
// Close modal if user clicks on the overlay
importModal.addEventListener('click', (event) => {
  if (event.target === importModal) {
    closeModal();
  }
});

// Address Book event listeners
document.getElementById('openAddressBookBtn').addEventListener('click', openAddressBookModal);
document.getElementById('addContactBtn').addEventListener('click', addContact);
contactList.addEventListener('click', handleContactListClick);
closeAddressBookModalBtn.addEventListener('click', closeAddressBookModal);
addressBookModal.addEventListener('click', (event) => {
  if (event.target === addressBookModal) {
    closeAddressBookModal();
  }
});

// Gas estimation listeners
const debouncedGasEstimate = debounce(updateAndShowGasEstimate, 300);
toInput.addEventListener('input', debouncedGasEstimate);
amountInput.addEventListener('input', debouncedGasEstimate);

// Load initial data when the application starts
document.addEventListener('DOMContentLoaded', () => {
  // Check for a wallet in session storage first
  loadWalletFromStorage();
  loadAddressBook();
});
