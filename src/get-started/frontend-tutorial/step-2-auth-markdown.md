# Step 2: Authorization inerfaces markdown

---

### 2.1. Render welcome interface

Welcome interface is used as application starting screen. Create `welcome.tag`:

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

### 2.2. Render dashboard interface

Dashboard interface allows user to login into account or register a new account. Create `dashboard.tag`:

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

### 2.3. Render registration interface

Create `register.tag`:

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

### 2.4. Render login interface

Create `login.tag`:

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

### 2.5. Set up routing

Set up routing for authorization interfaces inside `app.tag` file before end of `</app>` tag:

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

Now the login and registration interfaces are available in browser. Next step is to make then work.

[Login and registration inerfaces →](step-3-auth-logic.md)
