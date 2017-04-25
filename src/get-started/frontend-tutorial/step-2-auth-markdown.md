# Step 2: Authorization inerfaces markdown

---

### Basic Riot.js application

Fill `index.html` with basic markdown and include bower dependencies on it:

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
    <script src="bower_components/noty/js/noty/packaged/jquery.noty.packaged.min.js"></script>
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

All interfaces will be rendered into `<app>` tag.

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

### Welcome interface markdown

Welcome interface is used as application starting screen. Create `welcome.tag` with next content:

```html
<welcome>
    <div class="panel-body text-center">
        <h1>Crypto currency demo</h1>
        <p>Welcome! This mobile application is used to demonstrate how easy to set up you own crypto currency on Exonum blockchain platform.</p>
        <p>Proceed to start working with crypto currency in a seconds.</p>
        <div class="form-group">
            <a class="btn btn-lg btn-lg btn-primary" href="#dashboard">Proceed to demo</a>
        </div>
    </div>
</welcome>
```

---

### Dashboard interface markdown

Dashboard interface allows user to login into account or register a new account. Create `dashboard.tag` with next content:

```html
<dashboard>
    <div class="panel-heading">
        <div class="panel-title page-title text-center">
            <div class="h4">Crypto currency demo <span class="hidden-xs">application</span></div>
        </div>
    </div>
    <div class="panel-body text-center">
        <div class="form-group">
            <p>Create a new wallet:</p>
            <a href="#register" class="btn btn-lg btn-block btn-success">Register</a>
        </div>

        <div class="form-group">
            <p>Login into existed wallet:</p>
            <a href="#login" class="btn btn-lg btn-block btn-primary">Login</a>
        </div>

        <div class="form-group">
            <p>Explore blockchain:</p>
            <a href="#blockchain" class="btn btn-lg btn-block btn-default">Blockchain Explorer</a>
        </div>
    </div>
</dashboard>
```

---

### Register interface markdown

Create `register.tag` with next content:

```html
<register>
    <div class="panel-heading">
        <a class="btn btn-default pull-left page-nav" href="#dashboard">
            <i class="glyphicon glyphicon-arrow-left"></i>
            <span class="hidden-xs">Back</span>
        </a>
        <div class="panel-title page-title text-center">
            <div class="h4">Register</div>
        </div>
    </div>
    <div class="panel-body">
        <form>
            <div class="form-group">
                <label class="control-label">Login:</label>
                <input type="text" class="form-control">
            </div>
            <div class="form-group">
                <label class="control-label">Password:</label>
                <input type="text" class="form-control">
            </div>
            <div class="form-group">
                <button type="submit" class="btn btn-lg btn-block btn-primary">Register a new wallet</button>
            </div>
        </form>
    </div>
</register>
```

---

### Login interface markdown

Create `login.tag` with next content:

```html
<login>
    <div class="panel-heading">
        <a class="btn btn-default pull-left page-nav" href="#dashboard">
            <i class="glyphicon glyphicon-arrow-left"></i>
            <span class="hidden-xs">Back</span>
        </a>
        <div class="panel-title page-title text-center">
            <div class="h4">Login</div>
        </div>
    </div>
    <div class="panel-body">
        <form onsubmit={ login }>
            <div class="form-group">
                <label class="control-label">Login:</label>
                <input type="text" class="form-control">
            </div>
            <div class="form-group">
                <label class="control-label">Password:</label>
                <input type="text" class="form-control">
            </div>
            <div class="form-group">
                <button type="submit" class="btn btn-lg btn-block btn-primary">Login</button>
            </div>
        </form>
    </div>
</login>
```

---

### Set up basic routing

Set up routing for authorization interfaces inside `<app>` tag:

```html
    ...
    <script>
        this.on('mount', function() {

            route('/', function() {
                riot.mount('#content', 'welcome');
            });

            route('/dashboard', function() {
                riot.mount('#content', 'dashboard');
            });

            route('/login', function() {
                riot.mount('#content', 'login');
            });

            route('/register', function() {
                riot.mount('#content', 'register');
            });

            route.start(true);

        });
    </script>
</app>
```

---

Next step: [Login and register inerfaces →](step-3-auth-logic.md)
