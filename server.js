const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');

// 1. Ініціалізація Firebase Admin SDK (підключення до бази даних)
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();

// Мідлвари
app.use(cors());
app.use(express.json());

// Чорний список слів (Вимога 4.4)
const FORBIDDEN_WORDS = ['жах', 'обман', 'шахраї', 'погано'];

// --- МАРШРУТИ API ---

// ДОДАВАННЯ відгуку (POST) - Вимога 4.4
app.post('/api/tours/:tourId/reviews', async (req, res) => {
    try {
        const { tourId } = req.params;
        const { email, text, rating } = req.body;

        if (!text || !rating || !email) {
            return res.status(400).json({ error: 'Текст, рейтинг та email є обов\'язковими.' });
        }

        // Перевірка на заборонені слова (без урахування регістру)
        const textLower = text.toLowerCase();
        const containsForbiddenWord = FORBIDDEN_WORDS.some(word => textLower.includes(word));

        if (containsForbiddenWord) {
            return res.status(400).json({ error: 'Ваш відгук містить неприпустимі слова і не може бути опублікований.' });
        }

        // Формування об'єкта відгуку
        const newReview = {
            tourId,
            email,
            text,
            rating: Number(rating),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Збереження у Firestore (колекція 'reviews')
        const docRef = await db.collection('reviews').add(newReview);

        res.status(201).json({
            message: 'Відгук успішно додано!',
            review: { id: docRef.id, ...newReview }
        });

    } catch (error) {
        console.error("Помилка додавання відгуку:", error);
        res.status(500).json({ error: 'Внутрішня помилка сервера при збереженні відгуку.' });
    }
});

// ОТРИМАННЯ відгуків (GET) - Вимога 4.3
app.get('/api/tours/:tourId/reviews', async (req, res) => {
    try {
        const { tourId } = req.params;

        // Отримуємо всі відгуки для конкретного туру
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

        // Трансформація 1: Підрахунок середнього рейтингу
        const averageRating = (totalRating / reviews.length).toFixed(1);

        // Трансформація 2: Сортування від кращих (5) до гірших (1)
        reviews.sort((a, b) => b.rating - a.rating);

        // Відправляємо трансформовані дані на клієнт
        res.json({
            averageRating: Number(averageRating),
            reviews
        });

    } catch (error) {
        console.error("Помилка отримання відгуків:", error);
        res.status(500).json({ error: 'Внутрішня помилка сервера при завантаженні відгуків.' });
    }
});


// --- ХОСТИНГ СТАТИЧНИХ ФАЙЛІВ ФРОНТЕНДУ (Вимога 4.1) ---

// Роздаємо файли з папки public (сюди треба скопіювати збірку React)
app.use(express.static(path.join(__dirname, 'public')));

// Якщо маршрут не знайдено в API, віддаємо index.html
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Сервер успішно запущено на порту ${PORT}`);
});