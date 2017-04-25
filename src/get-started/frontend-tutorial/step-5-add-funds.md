# Step 5: Add funds

---

### TODO: Add funds interface markdown

---

### Set up route

Add routes into `app.tag`:

```javascript
route('/user/add-funds', function() {
    riot.mount('#content', 'add-funds');
});
```

---

### Add link to Add funds interface

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

### TODO: Write business logic

---

Next step: [Transfer funds →](step-6-transfer-funds.md)
