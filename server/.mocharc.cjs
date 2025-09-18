module.exports = {
  require: ['ts-node/register/transpile-only'],
  spec: ['src/**/*.test.ts'],
  extension: ['ts'],
  timeout: 5000,
  color: true
};
