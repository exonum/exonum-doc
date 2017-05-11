# Step 6: Transfer funds interface

---

### TODO: 6.1. Render transfer funds interface

---

### 6.2. Set up route

Add routes into `app.tag`:

```javascript
route('/user/transfer', function() {
    riot.mount('#content', 'transfer');
});
```

---

### 6.3. Add link to transfer funds interface

Add link from `wallet.tag` interface right after `<wallet-summary>` tag:

```html
...
<wallet-summary ...></wallet-summary>

<div class="form-group">
    <p class="text-center">Transfer your funds to another account:</p>
    <button class="btn btn-lg btn-block btn-primary" disabled={ wallet.balance== 0 } onclick={ transfer }>
        Transfer Funds
    </button>
</div>
...
```

Then add `transfer` event handler into logic in `wallet.tag`:

```javascript
transfer(e) {
    e.preventDefault();
    route('/user/transfer');
}
```

---

### TODO: 6.4. Write business logic

---

Now user can transfer funds into another account. Next step is make it possible to review blockchain status.

[Blockchain explorer →](step-7-blockchain-explorer.md)
