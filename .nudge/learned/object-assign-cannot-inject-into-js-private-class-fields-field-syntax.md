# Object.assign cannot inject into JS private class fields (#field syntax)

## What went wrong
AlertManager was created at the top of index.js before MQTT was initialized:
```js
const alertManager = new AlertManager(config.alerting, { mqttPublisher: null });
// ... later:
Object.assign(alertManager, { _mqtt: mqttPublisher }); // intended to patch MQTT in
```
This silently does nothing because AlertManager stores MQTT as a private field (`#mqtt`).
Private fields are not accessible via Object.assign, property assignment, or any external mutation —
the patched `_mqtt` key is set on the object but never read by the class.

## Fix
Delay creation of any class that needs an injected dependency until that dependency is ready.
In index.js, moved AlertManager construction to AFTER mqttPublisher is initialized:
```js
// Inside the if (pool) block, after mqttPublisher is created:
alertManager = new AlertManager(config.alerting, { mqttPublisher });
```
Then add a fallback outside the block for cases where pool/Redis is absent:
```js
if (!alertManager) alertManager = new AlertManager(config.alerting);
```

## Verification
node --check src/index.js  # no error
grep -n 'alertManager' src/index.js  # confirm single construction point inside pool block
