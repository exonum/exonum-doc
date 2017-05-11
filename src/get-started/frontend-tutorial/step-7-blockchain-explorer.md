# Step 7: Blockchain explorer

---

### TODO: 7.1. Render blockchain explorer interface

blockchain and block pages

---

### 7.2. Set up routes

Add routes into `app.tag`:

```javascript
route('/blockchain', function() {
    riot.mount('#content', 'blockchain');
});

route('/blockchain/block/*', function(height) {
    riot.mount('#content', 'block', {height: height});
});
```

---

### TODO: 7.3. Write business logic

---

### 7.4. Add links to blockchain explorer

Add link from `dashboard.tag` interface:

```html
<dashboard>
    ...
    <div class="panel-body text-center">
        ...
        <div class="form-group">
            <p>Explore blockchain:</p>
            <a href="#blockchain" class="btn btn-lg btn-block btn-default">Blockchain Explorer</a>
        </div>
    </div>
    ...
```

Add link from `wallet.tag` interface:

```html
<wallet>
    ...
    <div class="panel-body">
        ...
        <div class="form-group">
            <p class="text-center">Explore all transactions:</p>
            <a href="#blockchain" class="btn btn-lg btn-block btn-default">Blockchain Explorer</a>
        </div>
    </div>
    ...
```
