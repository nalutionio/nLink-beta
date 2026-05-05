const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

const badRequest = (message) => json(400, { error: message });
const unauthorized = (message = "Unauthorized") => json(401, { error: message });
const serverError = (message = "Server error") => json(500, { error: message });

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
};

module.exports = {
  json,
  badRequest,
  unauthorized,
  serverError,
  requireEnv,
};
