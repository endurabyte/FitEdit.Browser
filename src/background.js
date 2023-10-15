import './supabase.js'

let client = null;
let garminUser = null;
let requestedLogin = false;
let requestedGarminLogin = false;
let openedGarminTab = false;

const targetCookieNames = ["SESSIONID", "GARMIN-SSO-CUST-GUID"];
const url = "https://connect.garmin.com"
const intervalInMinutes = 0.25;

async function getLocalStorage(key) {
  return await new Promise(function(resolve, reject) {
    chrome.storage.local.get(key, res => {
      resolve(res[key]);
    })
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wait for a tab to finish loading, including redirects.
function waitForTabToLoad(tabId, maxRedirects = 10) {
  let redirectCount = 0;
  return new Promise((resolve, reject) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId_, info, tab) {
      if (tabId_ === tabId && info.status === 'loading') {
        if (++redirectCount > maxRedirects) {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error('Too many redirects'));
        }
      }

      if (tabId_ === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

function requestLogin() {

  if (requestedLogin) { return; }
  requestLogin = true;

  chrome.notifications.create('FITEDIT_NEEDS_LOGIN', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'FitEdit: Please log in to FitEdit',
    message: 'Please open the extension and log in to FitEdit.',
    priority: 2
  })
}

async function loginToGarmin() {
  console.log("loginToGarmin");

  let garminCreds = await getLocalStorage("garmin-creds");

  if (garminCreds === null || garminCreds === undefined) {
    console.error("No garmin credentials. Asking user to log in");
    requestGarminLogin();
    return;
  }

  if (openedGarminTab) { return; }
  openedGarminTab = true;

  chrome.tabs.create({ url: 'https://connect.garmin.com/signin' }, async (newTab) => {
    // Wait for tab to finish loading
    console.log("waiting for tab to load...");
    await waitForTabToLoad(newTab.id);
    await sleep(1 * 1000);

    console.log("executing script");
    // Fill form and close tab
    await chrome.scripting.executeScript({
      target: { tabId: newTab.id, },
      files: ["garminFill.js",],
    }, () => {
      // Close the tab
      //chrome.tabs.remove(newTab.id);
    });
  });
}

function requestGarminLogin() {
  console.log("requestGarminLogin");

  if (requestedGarminLogin) { return; }
  requestedGarminLogin = true;

  chrome.notifications.create('FITEDIT_NEEDS_GARMIN_LOGIN', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'FitEdit: Please log in to Garmin Connect',
    message: 'Please open the extension and enter your Garmin Connect credentials, or visit https://connect.garmin.com/ and log in.',
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

  garminUser.Cookies = cookies;

  await client
    .from("GarminUser")
    .update({ Cookies: cookies })
    .eq("Id", garminUser.Id);
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
  }
};

async function tick() {

  console.log("Background: tick()");

  // If the client is null, the background script has just initialized.
  // We need to login. We must also subscribe once per background init to onAlarm.
  const isFirstTick = client === null;

  if (isFirstTick) {
    chrome.notifications.onClicked.addListener(name => {
      if (name === "FITEDIT_NEEDS_LOGIN") {
        // Not allowed despite https://bugzilla.mozilla.org/show_bug.cgi?id=1799345
        // Results in "openPopup requires a user gesture" in FF 118
        // and "could not find an active browser window" in Chromium 119
        //chrome.action.openPopup();
      }
    });

    chrome.alarms.onAlarm.addListener(async _ => {
      await tick();
    });

    let loggedIn = await login();

    if (!loggedIn) {
      requestLogin();
      return;
    }

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

  loadUrl(url);
}

async function login() {

  let response = await fetch("https://www.fitedit.io/support/config.v1.json");
  const { projectId, anonKey } = await response.json();
  client = supabase.createClient(`https://${projectId}.supabase.co`, anonKey);

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
