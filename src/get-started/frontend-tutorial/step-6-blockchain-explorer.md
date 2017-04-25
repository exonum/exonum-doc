# Step 6: Blockchain explorer

---

TODO: add markdown to render blockchain explorer and block page

---

### Set up routes

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

TODO: add cryptocurrency logic

---

TODO: add links to blockchain: from dashboard, from wallet
