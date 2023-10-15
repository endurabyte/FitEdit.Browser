// Return a promise which resolves when the element appears or reject if the timeout has passed
function waitForElement(selector, timeout = 2000, pollInterval = 100) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const intervalId = setInterval(() => {
      const element = document.querySelector(selector);

      if (element) {
        clearInterval(intervalId);
        resolve(element);
      } else if (Date.now() - startTime >= timeout) {
        clearInterval(intervalId);
        reject(new Error('Element not found within timeout period.'));
      }
    }, pollInterval);
  });
}

async function fillGarminSsoForm(garminCreds) {
  console.log("fillGarminSsoForm");

  await waitForElement('#email', 5000)
    .then(async () => {
      document.querySelector('#email').value = garminCreds.email;
      document.querySelector('#password').value = garminCreds.pass;
      await sleep(1 * 1000);
      document.querySelector('input[type="submit"]').click();
    });
}

let garminCreds = await getLocalStorage("garmin-creds");

if (garminCreds === null || garminCreds === undefined) {
  console.error("fillGarminSsoForm: No garmin credentials.");
  return;
}

await fillGarminSsoForm(garminCreds);
