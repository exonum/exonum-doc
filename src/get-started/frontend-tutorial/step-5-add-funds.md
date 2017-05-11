# Step 5: Add funds interface

---

### TODO: 5.1. Render add funds interface

---

### 5.2. Set up route

Add routes into `app.tag`:

```javascript
route('/user/add-funds', function() {
    riot.mount('#content', 'add-funds');
});
```

---

### 5.3. Add link to add funds interface

Add link from `wallet.tag` interface right after `<wallet-summary>` tag:

```html
...
<wallet-summary ...></wallet-summary>

<div class="form-group">
    <p class="text-center">Add more funds to your account:</p>
    <a href="#user/add-funds" class="btn btn-lg btn-block btn-success">Add Funds</a>
</div>
...
```

---

### TODO: 5.4. Write business logic

---

Now user can add funds into account. Next step is make it possible to transfer funds into another account.

[Transfer funds interface →](step-6-transfer-funds.md)
