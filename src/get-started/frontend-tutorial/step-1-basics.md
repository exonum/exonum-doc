# Step 1: Basic structure

---

### 1.1. Set up npm

First of all install [Node.js](https://docs.npmjs.com/getting-started/installing-node) and [npm](https://docs.npmjs.com/getting-started/installing-node). Then initialize npm.

```
$ npm init
```

---

### 1.2. Configure express web server

Install [Express](https://expressjs.com/en/starter/installing.html) web framework as npm dependency.

```
$ npm install express --save
```

Now create an empty `index.html` file that will be used as root of an application.

Last step is to create `app.js` with primitive scenario to run Node.js application and serve `index.html` file on [http://127.0.0.1:3000](http://127.0.0.1:3000):

```javascript
var express = require('express');
var app = express();
var path = require('path');

app.use(express.static(__dirname + '/'));

app.get('/', function(req, res) {
    res.sendFile('index.html');
});

app.listen(3000);
```

---

### 1.3. Install bower dependencies

Install bower: 

```
$ npm install bower --save
```

Initialize bower:

```
$ bower init
```

Install bower dependencies used to build basic web application:

```
$ bower install bootstrap query riot riot-route --save
```

---

Next step: [Login and register inerfaces markdown →](step-2-auth-markdown.md)
