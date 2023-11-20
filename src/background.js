import './supabase.js'

let client = null;
let garminUser = null;
let requestedLogin = false;
let requestedGarminLogin = false;
let requestedGarminPermission = false;
let openedGarminTab = false;

const targetCookieNames = ["SESSIONID", "GARMIN-SSO-CUST-GUID"];
const url = "https://connect.garmin.com"
let intervalInMinutes = 0.25; // Increases after first successful fetch of SESSIONID

async function getLocalStorage(key) {
  return await new Promise(function(resolve, reject) {
    chrome.storage.local.get(key, res => {
      resolve(res[key]);
    })
  });
}

function requestLogin() {

  if (requestedLogin) { return; }
  requestedLogin = true;

  chrome.notifications.create('FITEDIT_NEEDS_LOGIN', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'FitEdit: Please log in to FitEdit',
    message: 'Please open the extension and log in to FitEdit.',
    priority: 2
  });
}

async function loginToGarmin() {
  console.log("loginToGarmin");

  requestGarminLogin();

  if (openedGarminTab) { return; }
  openedGarminTab = true;

  chrome.tabs.create({ url: 'https://connect.garmin.com' });
}

function haveCookiesChanged(oldCookies, newCookies) {
  if (oldCookies.length !== newCookies.length) {
    return true; // Different number of cookies.
  }

  // Create a map of cookie names to values for quick comparison.
  const oldCookieMap = new Map(oldCookies.map(cookie => [cookie.name, cookie.value]));

  // Check if any cookie has changed its value.
  return newCookies.some(cookie => oldCookieMap.get(cookie.name) !== cookie.value);
};

function requestGarminLogin() {
  console.log("requestGarminLogin");

  if (requestedGarminLogin) { return; }
  requestedGarminLogin = true;

  chrome.notifications.create('FITEDIT_NEEDS_GARMIN_LOGIN', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'FitEdit: Please log in to Garmin Connect',
    message: 'Please visit https://connect.garmin.com/ and log in.',
    priority: 2
  })
}

function requestGarminPermission() {
  console.log("requestGarminPermission");

  if (requestedGarminPermission) { return; }
  requestedGarminPermission = true;

  chrome.tabs.create({ url: 'https://connect.garmin.com' });
  chrome.notifications.create('FITEDIT_NEEDS_GARMIN_PERMISSION', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'FitEdit: Please grant permission',
    message: 'Please visit https://connect.garmin.com/ and click on the extension icon to grant permission.',
    priority: 2
  })
}

// Fetch cookies of a given URL
const getCookies = async url => {
  let allCookies = await chrome.cookies.getAll({ url });
  const cookies = allCookies.filter(cookie => targetCookieNames.includes(cookie.name));

  const hasSessionID = cookies.some(item => item.name === "SESSIONID");
  if (hasSessionID === false) {
    await loginToGarmin();
    return;
  }

  // Send the cookies to popup, if open
  chrome.runtime.sendMessage({ type: 'SET_COOKIES', payload: cookies }, _ => {
    if (chrome.runtime.lastError) {
      // Probably popup is not open
    }
  });

  chrome.storage.local.set({ 'cookies': cookies });

  if (garminUser === null) {
    requestLogin();
    return;
  }

  if (!haveCookiesChanged(garminUser.Cookies, cookies)) {
    return;
  }

  garminUser.Cookies = cookies;

  await client
    .from("GarminUser")
    .update({ Cookies: cookies })
    .eq("Id", garminUser.Id);

  intervalInMinutes = 2;
};

const loadUrl = async url => {
  try {
    let response = await fetch(url);
    if (response.ok) {
      await getCookies(url);
    } else {
      console.log(`Background: Error: ${response.status}`);
    }
  } catch (err) {
    console.log(err);

    if (err instanceof TypeError) {
      requestGarminPermission();
    }
  }
};

async function tick() {

  console.log("Background: tick()");

  // If the client is null, the background script has just initialized.
  // We need to login. We must also subscribe once per background init to onAlarm.
  const isFirstTick = client === null;

  if (isFirstTick) {
    chrome.alarms.onAlarm.addListener(async _ => {
      await tick();
    });
  }

  let loggedIn = await login();

  if (!loggedIn) {
    requestLogin();
  } else if (garminUser === null) {
    const { data } = await client
      .from("GarminUser")
      .select()
      .limit(1);

    garminUser = data[0];
  }

  // Schedule the next call to tick()
  await chrome.alarms.create({
    delayInMinutes: intervalInMinutes
  });

  if (loggedIn) {
    loadUrl(url);
  }
}

async function login() {

  let response = await fetch("https://www.fitedit.io/support/config.v1.json");
  const { projectId, anonKey } = await response.json();
  client = supabase.createClient(`https://${projectId}.supabase.co`, anonKey);

  let session = await getLocalStorage("session");
  await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  });

  const { data: { user } } = await client.auth.getUser();
  let loggedIn = user != null && user.aud === "authenticated";

  return loggedIn;
}

async function install() {

  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'garminLogin') {
      await loginToGarmin();
    }
  });

  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason !== chrome.runtime.OnInstalledReason.INSTALL) {
      return;
    }

    await chrome.alarms.create({
      delayInMinutes: intervalInMinutes
    });

    // Schedule the first call to tick()
    chrome.alarms.onAlarm.addListener(async _ => {
      await tick();
    });

    console.log("Background: installed");
  });
}

install();
tick();
