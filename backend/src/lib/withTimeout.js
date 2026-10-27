/**
 * Rejects with a TIMEOUT error when `promise` has not settled within `ms`.
 * For calls to other services (Google, email) whose own clients have no
 * deadline: a request waiting on them must not hang until the proxy's 504.
 * The underlying call is not cancelled; its late result is ignored.
 *
 * @param {Promise} promise
 * @param {Number} ms
 * @param {String} [label] - named in the error message
 */
const withTimeout = (promise, ms, label = 'operation') => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`${label} timed out after ${ms} ms`), { code: 'TIMEOUT' }));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

module.exports = { withTimeout };
