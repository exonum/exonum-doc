# Step 3: Authorization inerfaces logic

---

### Global notifications

To toggle global application messages install [noty](http://ned.im/noty/) notification library:

```
$ bower install noty --save
```

Then include it into `index.html`:

```html
<script src="bower_components/noty/js/noty/packaged/jquery.noty.packaged.min.js"></script>
```

Now create global mixin inside `app.tag` and create wrapper for `noty` library:

```html
    <script>
        ...
        riot.mixin({
            notify: function(type, text) {
                noty({
                    layout: 'topCenter',
                    timeout: 5000,
                    type: type || 'information',
                    text: text
                });
            }
        });
    </script>
</app>
```

*`riot.mixin` shares variables and methods through all tags.*

Now it is possible to toggle global application message from each tag:

```javascript
this.notify('warning', 'You have not any money yet. Add some funds.');
```

---

### Ajax loaders

Each time client waiting for server response it make sense to show ajax loader. Let's add it into `app.tag`:

```html
<div class="loader" if={ loading }></div>
```

Extend `riot.mixin` with method which toggle loader from any tag:

```javascript
var self = this;

riot.mixin({
    ...
    toggleLoading: function(state) {
        self.loading = state;
        self.update();
    }
});
```

---

### TODO: Install exonum-client

waiting for releasing into open source

this.core

---

### TODO: Write business logic

waiting for implementation

this.service

---

Next step: [Wallet interface →](step-4-wallet.md)
