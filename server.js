const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');

let serviceAccount;
try {
    serviceAccount = require('./serviceAccountKey.json');
} catch (e) {
    if (process.env.FIREBASE_KEY) {
        serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
    } else {
        console.error("Firebase credentials not found!");
    }
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

const FORBIDDEN_WORDS = ['жах', 'обман', 'шахраї', 'погано'];

app.post('/api/tours/:tourId/reviews', async (req, res) => {
    try {
        const { tourId } = req.params;
        const { email, text, rating } = req.body;

        if (!text || !rating || !email) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const textLower = text.toLowerCase();
        if (FORBIDDEN_WORDS.some(word => textLower.includes(word))) {
            return res.status(400).json({ error: 'Review contains forbidden words' });
        }

        const newReview = {
            tourId,
            email,
            text,
            rating: Number(rating),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('reviews').add(newReview);
        res.status(201).json({ id: docRef.id, ...newReview });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tours/:tourId/reviews', async (req, res) => {
    try {
        const { tourId } = req.params;
        const snapshot = await db.collection('reviews').where('tourId', '==', tourId).get();

        if (snapshot.empty) {
            return res.json({ averageRating: 0, reviews: [] });
        }

        let totalRating = 0;
        const reviews = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            totalRating += data.rating;
            reviews.push({ id: doc.id, ...data });
        });

        const averageRating = (totalRating / reviews.length).toFixed(1);
        reviews.sort((a, b) => b.rating - a.rating);

        res.json({
            averageRating: Number(averageRating),
            reviews
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});