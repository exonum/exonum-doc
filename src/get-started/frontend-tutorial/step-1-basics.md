# Step 1: Basic structure

---

### 1.1. Set up npm

First of all install [Node.js](https://docs.npmjs.com/getting-started/installing-node) and [npm](https://docs.npmjs.com/getting-started/installing-node). Then initialize npm.

```
$ npm init
```

---

### 1.2. Install bower dependencies

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

### 1.3. Configure express web server

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

### 1.4. Create Riot.js application

Fill `index.html` with the basic markdown and include bower dependencies:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <link rel="stylesheet" href="bower_components/bootstrap/dist/css/bootstrap.min.css">
    <link rel="stylesheet" href="bower_components/bootstrap/dist/css/bootstrap-theme.css.map">
</head>
<body>
    <script src="bower_components/riot/riot+compiler.min.js"></script>
    <script src="bower_components/riot-route/dist/route.min.js"></script>
    <script src="bower_components/jquery/dist/jquery.min.js"></script>
</body>
</html>
```

Then create subdirectory `tags` to store custom Riot.js tags.

Create file `app.tag` and place it into `tags` subdirectory:

```html
<app>
    <div class="container">
        <div class="row">
            <div class="col-sm-6 col-sm-offset-3">
                <div id="content" class="panel panel-default"></div>
            </div>
        </div>
    </div>
</app>
```

All interfaces will be rendered into `<app>` tag in `<div id="content"></div>` block.

Then include `<app>` tag and insert it after start of `<body>` tag:

```html
...
<body>
    <app></app>
    ...
``` 

Last thing is to mount `<app>` tag. Do it before end of `</body>` tag:

```html
    ...
    <script type="text/javascript">
        riot.mount('app');
    </script>
</body>
```

---

Now the very basic application is ready. Next step is to create login and registration interfaces.

[Login and registration inerfaces markdown →](step-2-auth-markdown.md)
