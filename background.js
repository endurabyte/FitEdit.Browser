import './supabase.js'

let client = null;
let garminUser = null;

const targetCookieNames = ["SESSIONID", "GARMIN-SSO-CUST-GUID"];
const url = "https://connect.garmin.com"
const intervalInMinutes = 0.25;

// Fetch cookies of a given URL
const getCookies = async url => {
  let allCookies = await chrome.cookies.getAll({ url });
  const cookies = allCookies.filter(cookie => targetCookieNames.includes(cookie.name));

  // Send the cookies to popup, if open
  chrome.runtime.sendMessage({ type: 'SET_COOKIES', payload: cookies }, _ => {
    if (chrome.runtime.lastError) {
      // Probably popup is not open
    }
  });

  chrome.storage.local.set({ 'cookies': cookies });
  garminUser.Cookies = cookies;

  await client
    .from("GarminUser")
    .update({ Cookies: cookies })
    .eq("Id", garminUser.Id);
};

const loadWebPage = async url => {
  let response = await fetch(url);
  if (response.ok) {
    await getCookies(url);
  } else {
    console.log(`Error: ${response.status}`);
  }
};

async function init() {

  let response = await fetch("https://www.fitedit.io/support/config.v1.json");
  const { projectId, anonKey } = await response.json();
  client = supabase.createClient(`https://${projectId}.supabase.co`, anonKey);

  const { data: { user } } = await client.auth.getUser()

  const { data } = await client
    .from("GarminUser")
    .select()
    .limit(1);

  garminUser = data[0];

  setInterval(() => {
    loadWebPage(url);
  }, intervalInMinutes * 60 * 1000);

  loadWebPage(url);
}

init();
