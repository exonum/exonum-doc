# Step 5: Transactions interfaces

---

TODO: added markdown for add funds and transfer pages

---

### Set up routes

Add routes into `app.tag`:

```javascript
route('/user/transfer', function() {
    riot.mount('#content', 'transfer');
});

route('/user/add-funds', function() {
    riot.mount('#content', 'add-funds');
});
```

---

TODO: add links to add funds and transfer pages from wallet page

---

TODO: add cryptocurrency logic

---

Next step: [Blockchain explorer →](step-6-blockchain-explorer.md)
