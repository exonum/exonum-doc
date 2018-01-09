# Getting started

JavaScript light client is a library with a number of helper functions used to work with Exonum blockchain
from browser and Node.js. Find out more information about the
[architecture and tasks of light clients](../architecture/clients).

## Install
There are several options to include light client in the application:

* Install as a [package][npmjs] from npm registry (recommended).
* Download [source code][github] from GitHub and compile it before use in browser.

## Include

Include in browser:

```html
<script src="node_modules/exonum-client/dist/exonum-client.min.js"></script>
```

Include in Node.js:

```javascript
var Exonum = require('exonum-client');
```

[npmjs]: https://www.npmjs.com/package/exonum-client
[github]: https://github.com/exonum/exonum-client
