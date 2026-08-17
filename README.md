# CG भू-संपत्ति गाइडलाइन Portal

छत्तीसगढ़ के सभी जिलों की भू-संपत्ति गाइडलाइन दरें देखने के लिए एक private web portal।

---

## Setup Instructions (सेटअप कैसे करें)

### Step 1: MEGA से ZIP Download करें
1. इस link से ZIP download करें:
   **https://mega.nz/file/XItSzLxZ#Etu5hSJOpgIuleCfzkl4TijiBbfWigM_4O2OIuxH6HE**

2. Downloaded ZIP का नाम `cg_guideline.zip` रखें

3. इस ZIP को `data/` folder में रखें:
   ```
   cg-guideline-rate/
   ├── data/
   │   └── cg_guideline.zip   ← यहाँ रखें
   ├── public/
   │   ├── index.html
   │   ├── style.css
   │   └── app.js
   ├── server.js
   └── package.json
   ```

### Step 2: Server Start करें
```bash
node server.js
```

### Step 3: Browser में खोलें
```
http://localhost:3000
```

---

## ZIP Structure (ZIP की संरचना)

ZIP के अंदर structure ऐसी होनी चाहिए:
```
cg_guideline.zip
├── रायपुर/
│   ├── रायपुर.pdf
│   ├── आरंग.pdf
│   └── अभनपुर.pdf
├── बिलासपुर/
│   ├── बिलासपुर.pdf
│   └── बिल्हा.pdf
...
```

> **Note:** District folder के नाम = District dropdown में दिखने वाले नाम  
> **Note:** PDF file का नाम (बिना .pdf) = Tehsil dropdown में दिखने वाला नाम

---

## Features (सुविधाएँ)

- ✅ जिला और तहसील dropdown से PDF चुनें
- ✅ PDF inline viewer (download नहीं होगा)
- ✅ Page navigation (prev/next/jump to page)
- ✅ Zoom in/out
- ✅ किसी भी page को PNG image के रूप में save करें
- ✅ Keyboard navigation (Arrow keys)
- ✅ Mobile responsive design
- ✅ केवल selected tehsil का PDF load होता है (799MB ZIP एक साथ load नहीं होगी)

---

## Disclaimer

> यह एक निजी जानकारी पोर्टल है। किसी भी रेट की पुष्टि के लिए संबंधित विभाग से संपर्क करें।  
> हम किसी भी रेट की पुष्टि नहीं करते।
"# Guildline" 
