# Step 6: Transfer funds

---

### TODO: Transfer funds interface markdown

---

### Set up route

Add routes into `app.tag`:

```javascript
route('/user/transfer', function() {
    riot.mount('#content', 'transfer');
});
```

---

### Add link to Transfer funds interface

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

### TODO: Write business logic

---

Next step: [Blockchain explorer →](step-7-blockchain-explorer.md)
