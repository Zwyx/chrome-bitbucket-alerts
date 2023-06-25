# chrome-bitbucket-alerts

Alerts for builds on BitBucket.

## Installation

### Chrome

- run `npm run build`,
- open `chrome://extensions`,
- activate `Developer mode`,
- click `Load unpacked` and open the `dist` folder created by the build command.

### Firefox

- run `npm run pack:firefox`,
- use the the Developer or Nightly edition of Firefor,
- open `about:config` and set `xpinstall.signatures.required` to `false`
- open `about:addons`,
- click the cog wheel, `Install Add-on From File...`, and select the `xpi` file present in the `dist` folder created by the build command,
- (optional) reopen `about:config` and set `xpinstall.signatures.required` back to `true`.
