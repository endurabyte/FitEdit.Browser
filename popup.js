let client = null;

let emailInput = null;
let otpInput = null;
let signinButton = null;
let cancelButton = null;
let verifyButton = null;
let signoutButton = null;
let resultDiv = null;

const showSignIn = () => {
  verifyButton.style.display = 'none';
  signinButton.style.display = 'inline-block';
  signoutButton.style.display = 'none';
  cancelButton.style.display = 'none';
  otpInput.style.display = 'none';
  emailInput.style.display = 'inline-block';
  resultDiv.innerHTML = '';
};

function showOtp() {
  verifyButton.style.display = 'inline-block';
  signinButton.style.display = 'none';
  signoutButton.style.display = 'none';
  cancelButton.style.display = 'inline-block';
  otpInput.style.display = 'inline-block';
  emailInput.style.display = 'none';
  resultDiv.innerHTML = '';
}

function showSignOut() {
  verifyButton.style.display = 'none';
  signoutButton.style.display = 'inline-block';
  signinButton.style.display = 'none';
  cancelButton.style.display = 'none';
  otpInput.style.display = 'none';
  emailInput.style.display = 'none';
  resultDiv.innerHTML = '';
}

const populateTable = cookies => {
  const tableBody = document.getElementById("cookieTableBody");
  tableBody.innerHTML = "";

  cookies.forEach(cookie => {
    const row = tableBody.insertRow(-1);
    const nameCell = row.insertCell(0);
    const valueCell = row.insertCell(1);

    nameCell.innerHTML = cookie.name;
    valueCell.innerHTML = cookie.value;
  });
};

async function getLocalStorage(key) {
  return await new Promise(function(resolve, reject) {
    chrome.storage.local.get(key, res => {
      resolve(res[key]);
    })
  });
}

async function init() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SET_COOKIES') {
      populateTable(message.payload);
    }
  });

  const cookies = await getLocalStorage("cookies");
  if (cookies) {
    populateTable(cookies);
  }

  let response = await fetch("https://www.fitedit.io/support/config.v1.json");
  const { projectId, anonKey } = await response.json();
  client = supabase.createClient(`https://${projectId}.supabase.co`, anonKey);
}

document.addEventListener("DOMContentLoaded", async () => {
  await init();

  emailInput = document.getElementById('email');
  otpInput = document.getElementById('otp');
  signinButton = document.getElementById('signin');
  cancelButton = document.getElementById('cancel');
  verifyButton = document.getElementById('verify');
  signoutButton = document.getElementById('signout');
  resultDiv = document.getElementById('result');

  let isOtpSent = await getLocalStorage("isOtpSent");
  if (isOtpSent) {
    showOtp();
  }

  let email = await getLocalStorage("email");
  emailInput.value = email === undefined ? null : email;

  checkSignedIn();

  signinButton.addEventListener('click', async () => {
    const email = emailInput.value;
    chrome.storage.local.set({ "email": emailInput.value });

    const { data, error } = await client.auth.signInWithOtp({
      email,
    });

    if (error) {
      resultDiv.innerHTML = `<span class="error">Error: ${error.message}</span>`;
      return;
    }

    chrome.storage.local.set({ "isOtpSent": true });
    showOtp();
    resultDiv.innerHTML = 'We sent you an email. Please enter the code in the email.';
  });

  verifyButton.addEventListener('click', async () => {
    const email = emailInput.value;
    const otp = otpInput.value;

    const { data, error } = await client.auth.verifyOtp({
      email: email,
      token: otp,
      type: 'email'
    });

    if (error) {
      resultDiv.innerHTML = `<span class="error">Error: ${error.message}</span>`;
      return;
    }

    chrome.storage.local.set({ "isOtpSent": false });
    checkSignedIn();
  });

  cancelButton.addEventListener('click', async () => {
    chrome.storage.local.set({ "isOtpSent": false });
    showSignIn();
  });

  signoutButton.addEventListener('click', async () => {
    const { error } = await client.auth.signOut()
    checkSignedIn();
  });
});

async function checkSignedIn() {

  const { data: { user } } = await client.auth.getUser()

  let isOtpSent = await getLocalStorage("isOtpSent");
  if (isOtpSent) {
    showOtp();
    return;
  }

  let isSignedIn = user != null && user.aud === "authenticated";

  if (isSignedIn) {
    showSignOut();

    client
      .channel('realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'GarminUser' }, payload => {
        console.log('Got GarminUser ', payload)
      })
      .subscribe()

    client
      .channel('realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'GarminActivity' }, payload => {
        console.log('Got Garmin Activity ', payload)

        resultDiv.innerHTML = payload.new.Name + "<br>" + payload.new.Description;
      })
      .subscribe()

  } else {
    showSignIn();
  }
}
