# Демонстрація інтеграції Lemon Squeezy

## Що вже реалізовано

- вибір Monthly або Annual у модалці **Manage plan**;
- вибір EUR або USD у **Profile & billing** передається до захищеної Function;
- checkout використовує окремий allowlisted Store/Variant набір для кожної валюти;
- якщо EUR Store ще не налаштований, EUR checkout блокується без перенаправлення на USD;
- Annual вибрано за замовчуванням як вигідніший тариф;
- безпечне створення checkout через Firebase callable Function;
- Firebase UID, email, інтервал і валюта передаються в Lemon Squeezy як checkout metadata;
- webhook перевіряється через HMAC-підпис;
- обробляються створення, оновлення, скасування, поновлення, завершення та пауза підписки;
- стан підписки записується в `users/{uid}/billing/subscription`;
- extension читає Firestore і вмикає Pro тільки за серверним станом;
- для активного Pro в модалці показуються тариф, дата поновлення/завершення і кнопка **Manage billing**;
- Customer Portal URL отримується через захищену Firebase Function;
- Test mode та Live mode розділені конфігурацією;
- одна API key на середовище може працювати з обома Store одного Lemon Squeezy акаунта;
- додано Firebase Emulator Suite режим, який не потребує Blaze;
- production-збірка не отримує localhost permissions і не підключається до emulator-ів.

## Швидка локальна демонстрація

1. Встановити Java 21.
2. Створити `functions/.env.local` і `functions/.secret.local` за шаблонами та заповнити USD Test mode IDs.
3. Запустити `npm run emulators:billing`.
4. В іншому терміналі запустити `npm run dev:billing-local`.
5. Завантажити `extension/dist` через Chrome **Load unpacked**.
6. Увійти в extension.
7. Скопіювати UID з `http://127.0.0.1:4000` → Authentication.
8. Виконати:

   ```bash
   npm run simulate:billing-webhook -- --uid=YOUR_LOCAL_UID --interval=annual
   ```

9. Показати документ підписки у локальному Firestore.
10. Відкрити **Manage plan** і показати активний Annual Pro з валютою USD у Firestore.

## Повна Test mode демонстрація

Додатково потрібні Test mode API key Lemon Squeezy та тимчасовий HTTPS tunnel до локального порту `5001`. Після налаштування Test webhook можна провести оплату тестовою карткою й показати повний ланцюжок:

`extension → callable Function → Lemon checkout → signed webhook → Firestore → Pro UI`.

## Що залишиться після демонстрації

- власник проєкту підключає корпоративний billing account і Blaze до Firebase Staging;
- staging Functions деплояться у `myfeedpilot-staging`;
- тимчасовий tunnel замінюється постійним Firebase webhook URL;
- проводиться спільний Test mode тест у staging-середовищі;
- після авторизації EUR Store додаються його Store ID і два Variant IDs без зміни checkout-коду;
- перед релізом створюються Live mode API key, Store/Variant IDs і webhook secret;
- налаштовуються budget alerts/spend caps та моніторинг помилок webhook.
