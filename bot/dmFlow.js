// Manages pending DM reply flows.
// Each entry: discordUserId -> { resolve: fn, timer: timeout }
const pending = new Map();

async function sendDM(user, text) {
  const dm = await user.createDM();
  return dm.send(text);
}

// Wait for the next DM message from a user. Returns the text or throws on timeout.
function waitForReply(userId, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(userId);
      reject(new Error('timeout'));
    }, timeoutMs);
    pending.set(userId, {
      resolve: (content) => {
        clearTimeout(timer);
        pending.delete(userId);
        resolve(content.trim());
      },
    });
  });
}

function tryResolve(userId, content) {
  const flow = pending.get(userId);
  if (flow) { flow.resolve(content); return true; }
  return false;
}

module.exports = { sendDM, waitForReply, tryResolve };
