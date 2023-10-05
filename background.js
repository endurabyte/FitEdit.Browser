import './supabase.js'

let client = null;
let garminUser = null;
let requestedLogin = false;
let requestedGarminLogin = false;

const targetCookieNames = ["SESSIONID", "GARMIN-SSO-CUST-GUID"];
const url = "https://connect.garmin.com"
const intervalInMinutes = 0.25;

// Fetch cookies of a given URL
const getCookies = async url => {
  let allCookies = await chrome.cookies.getAll({ url });
  const cookies = allCookies.filter(cookie => targetCookieNames.includes(cookie.name));

  if (cookies.length == 0) {
    requestGarminLogin()
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
    .from("")
    .update({ Cookies: cookies })
    .eq("Id", garminUser.Id);
};

const loadUrl = async url => {
  let response = await fetch(url);
  if (response.ok) {
    await getCookies(url);
  } else {
    console.log(`Background: Error: ${response.status}`);
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

function requestGarminLogin() {

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

async function install() {

  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason !== chrome.runtime.OnInstalledReason.INSTALL) {
      return;
    }

    await chrome.alarms.create({
      delayInMinutes: intervalInMinutes
    });

    // Schedule the first call to tick()
    chrome.alarms.onAlarm.addListener(async details => {
      await tick();
    });

    console.log("Background: installed", details);
  });
}

install();
tick();
