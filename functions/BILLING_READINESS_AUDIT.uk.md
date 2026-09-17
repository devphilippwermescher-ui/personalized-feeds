# Lemon Squeezy subscription readiness checklist для myFeedPilot

## Резюме

Поточна інтеграція вже доводить основний Test mode ланцюжок:

`extension → authenticated callable Function → Lemon Squeezy checkout → signed webhook → Firestore → Pro UI`

Сильні сторони поточної реалізації:

- API key і webhook secret залишаються у Firebase Secret Manager;
- checkout створюється на backend для автентифікованого Firebase-користувача;
- Store ID і Variant ID перевіряються за allowlist;
- Test і Live payloads розділяються через `test_mode`;
- webhook-підпис перевіряється через HMAC SHA-256 над raw body;
- клієнт не може записувати `users/{uid}/billing/*` через Firestore Rules;
- скасована підписка зберігає Pro до `ends_at`, а `expired` забирає доступ;
- `past_due` зберігає Pro під час payment recovery;
- підтверджена checkout-активація оновлює відкритий sidebar і запускає Pro Profile Visitors collection без reload;
- customer portal відкривається через свіжий signed URL;
- USD/EUR та Monthly/Annual підтримуються як окремі конфігурації;
- unit-тести billing-модулів проходять: 31 Functions tests; повний Extension suite — 664 tests.

Три попередні архітектурні блокери вже закрито в коді:

1. Кожна provider subscription має окремий документ, а aggregate entitlement вибирається з усіх підписок користувача.
2. Небезпечний standard-link fallback прибрано; checkout прив'язується через короткоживу opaque server-owned session.
3. Webhook payload проходить runtime Zod validation, а CI встановлює, перевіряє, тестує та збирає `functions/`.

Production release усе ще заблокований до налаштування Live products/variants, Live API key, Live webhooks, production secrets/env, моніторингу, reconciliation job, правил для refunds/disputes та приватного smoke test реальною карткою.

## 1. Зафіксована архітектура

### Середовища

| Рівень | Firebase | Lemon Squeezy | Картка | Призначення |
|---|---|---|---|---|
| Local | Emulator Suite | синтетичні signed payloads або Test mode через tunnel | тестова | швидкі автоматичні й інтеграційні тести |
| Development | `myfeedpilot-dev` | не повинен отримувати Live дані | тестова, якщо підключено Test mode | звичайна розробка без реальних оплат |
| Staging | `myfeedpilot-staging` | Test mode stores, products, API key і webhooks | тільки тестові номери | повний end-to-end до релізу |
| Production | `myfeedpilot-production` | тільки Live stores, products, API key і webhooks | реальна | реальні продажі та приватний live smoke test |

Test mode і Live mode у Lemon Squeezy — окремі набори products, customers, orders, subscriptions, API keys і webhooks. Після `Copy to Live Mode` products і variants отримують нові ID та checkout URL.^1

### Поточні довірчі межі

- Extension є недовіреним клієнтом: він може лише просити backend створити checkout/portal URL і читати власний billing state.
- Firebase callable Function довіряє Firebase Auth token, але не повинна довіряти ціні, Store ID, Variant ID, plan або UID, переданим клієнтом.
- Lemon Squeezy webhook стає довіреним лише після перевірки HMAC над незміненим raw body.^2
- Firestore billing state має записувати тільки Admin SDK/backend. Firebase Admin SDK обходить Firestore Rules, тому IAM і секрети backend так само важливі, як Rules.^3
- Pro entitlement має обчислюватися із server-owned billing state, а не з checkout success page, redirect, email, local storage або UI state.

## 2. Канонічна модель lifecycle

### Рекомендована політика доступу

| Provider status | Рекомендований plan | Пояснення | Поточний код |
|---|---|---|---|
| `active` | Pro | Оплата/підписка активна | правильно: Pro |
| `cancelled` і `ends_at > now` | Pro | Оплати припинено, але оплачений період ще триває | правильно: Pro |
| `cancelled` і `ends_at <= now` | Free | Grace period завершився; зазвичай невдовзі приходить `expired` | правильно за локальним часом |
| `past_due` | **Pro** | Іде 4 payment retries приблизно протягом двох тижнів; Lemon Squeezy вказує, що доступ зберігається | правильно: Pro |
| `unpaid` | Free, якщо це продуктове рішення | Усі retry вичерпано; recovery/dunning ще може повернути підписку | зараз Free, але політика не задокументована |
| `expired` | Free | Підписка завершена й більше не resumable | правильно: Free |
| `on_trial` | Pro лише якщо trials офіційно ввімкнено | Потрібно зберігати `trial_ends_at` і тестувати conversion | зараз Free; прийнятно, доки trials заборонені |
| `paused` | Free + alert | Pause не є частиною продукту і має бути вимкнений у portal | зараз Free через `subscription_updated` |
| невідомий status | Free + alert/quarantine | Fail closed, але не губити подію | зараз Free без спеціального alert |

Lemon Squeezy визначає `past_due` як період retry, а `unpaid` як стан після чотирьох невдалих спроб. Їхня dunning-документація прямо каже, що під час `past_due` користувач зберігає доступ, а при `unpaid` — втрачає.^4 В іншій загальній сторінці є ширше формулювання «доступ у всіх статусах, крім expired».^5 Для myFeedPilot варто явно зафіксувати конкретнішу політику вище та покрити її тестами, а не покладатися на нечітке формулювання.

### Cancellation, resume та expiration

- Cancel не дорівнює негайному Free: `cancelled=true`, `status=cancelled`, `ends_at` заповнений, Pro діє до `ends_at`.
- Resume до `ends_at` повертає `active`, прибирає `ends_at` і відновлює початковий графік оплат.
- Після `ends_at` приходить `expired`; доступ забирається й resume вже неможливий.^6
- Після resume старі `endsAt`/`currentPeriodEnd` поля мають видалятися, а не залишатися через Firestore merge. Поточний `FieldValue.delete()` це робить правильно.

## 3. Які webhook events підключати

### Рекомендований набір для обох Test mode stores зараз

#### Обов’язкові для entitlement state

- [x] `subscription_created`
- [x] `subscription_updated`
- [x] `subscription_cancelled`
- [x] `subscription_resumed`
- [x] `subscription_expired`

`subscription_updated` є catch-all і відправляється поряд із lifecycle-подіями. Детальні події technically дублюють його, але вони корисні для прозорого аудиту та симуляцій. Lemon Squeezy називає `subscription_created`, `subscription_updated` і `subscription_payment_success` мінімальним набором для subscription integration.^7

#### Рекомендовані для billing history, support та monitoring

- [ ] `subscription_payment_success`
- [ ] `subscription_payment_failed`
- [ ] `subscription_payment_recovered`
- [ ] `subscription_payment_refunded`
- [ ] `order_refunded`

Ці події не повинні проходити через поточний `Subscription` parser: payment events несуть `Subscription invoice object`, а refund order — `Order object`.^7 Для них потрібні окремі schema/parser/handler та окреме збереження billing history.

Практична політика:

- `payment_success`: записати invoice/renewal history, метрику успіху; entitlement оновлює наступний `subscription_updated`.
- `payment_failed`: записати спробу, показати користувачу banner «update payment method», але лишити Pro у `past_due`.
- `payment_recovered`: прибрати banner, записати recovery; поряд завжди буде `payment_success`.
- `payment_refunded`/`order_refunded`: зафіксувати refund і виконати явно визначену policy. Refund сам по собі не повинен випадково змінювати entitlement без продуктового рішення.

#### Увімкнути лише якщо буде відповідна функція

| Event | Чи потрібен зараз | Коли потрібен |
|---|---|---|
| `customer_updated` | ні | якщо локально показуємо billing name/email/address |
| `order_created` | необов’язково | для order history/analytics; `subscription_created` уже містить order relation |
| `dispute_created` | бажано перед Live | fraud/support alert, можливий тимчасовий hold за окремою policy |
| `dispute_resolved` | бажано перед Live | зняти hold або закрити кейс |
| `subscription_plan_changed` | не робити джерелом істини | UI дозволяє симуляцію, але `subscription_updated` має catch-all; перевірити фактичний payload перед підтримкою |
| `subscription_paused` | ні | Pause вирішено не підтримувати |
| `subscription_unpaused` | ні | Pause вирішено не підтримувати |
| `license_key_created` | ні | лише якщо myFeedPilot переходить на license keys |
| `license_key_updated` | ні | лише для license-key activation model |
| `affiliate_activated` | ні | лише для affiliate program automation |

Поточна офіційна Event Types сторінка не перелічує dispute і `subscription_plan_changed`, хоча dashboard може їх показувати. Тому до реалізації слід зняти реальний Test mode payload через webhook.site або quarantine log і не вигадувати schema.^7

## 4. Lemon Squeezy Test mode setup

### Store/account

- [x] Створені окремі USD та EUR stores.
- [x] Test mode увімкнений.
- [x] Identity verification подана; EUR store може залишатися in review.
- [ ] 2FA увімкнена для owner та всіх team members.
- [ ] Team access обмежений мінімальними потрібними ролями.
- [ ] Recovery email і contact email перевірені.
- [ ] Store descriptor/name, support email і branding однакові з myFeedPilot.
- [ ] Customer portal налаштований: Update/Cancel/Resume увімкнені; Pause вимкнений.
- [ ] Recovery/dunning schedule переглянутий і задокументований.
- [ ] Test notification recipients відомі команді: Test mode emails надходять owner/team, незалежно від email у checkout.^1

### Products і variants

Для кожного Test mode store:

- [x] Product `myFeedPilot Pro` має тип Subscription.
- [x] Monthly variant: стандартна ціна, repeat every 1 month.
- [x] Annual variant: стандартна ціна, repeat every 1 year.
- [x] Product і обидва variants published/enabled.
- [x] Variant IDs, а не Product ID, використовуються для checkout.
- [ ] Store ID отриманий із Settings → Stores, а не з Product → Copy ID.
- [ ] Tax category перевірена. Для SaaS, який може використовуватися і особисто, і для бізнесу, Lemon Squeezy рекомендує `SaaS – Personal use`; якщо продукт виключно B2B — `SaaS – Business use`.^8
- [ ] Free trial вимкнений, якщо код не підтримує `on_trial`.
- [ ] Quantity завжди 1; package/graduated/volume pricing не використовується.
- [ ] License keys і files вимкнені, якщо вони не є частиною продукту.
- [ ] Checkout description, refund policy, terms, privacy URL та support contact актуальні.
- [ ] Ціни в UI звіряються з Lemon Squeezy. Нині `$19/€19` і `$156/€156` захардкоджені у `shared/subscription-config.ts`, тому drift можливий.
- [ ] Додати automated config validation: API перевіряє, що кожен ID існує, належить правильному store, published, subscription, test_mode, currency, interval і expected price.

### API key та secrets

- [x] Test mode API key створений і зберігається як `LEMON_SQUEEZY_API_KEY` у staging Secret Manager.
- [x] Webhook signing secret зберігається як `LEMON_SQUEEZY_WEBHOOK_SECRET`.
- [x] Секрети не лежать у client bundle або tracked `.env`.
- [ ] API key має зрозуміле ім’я (`myfeedpilot-staging`) і owner.
- [ ] Є процедура rotation/revocation API key і webhook secret.
- [ ] Secret rotation перевірена без downtime.
- [ ] Production використовує інші Live secrets.

API key не можна зберігати в GitHub або client-side code; Lemon Squeezy рекомендує регулярну rotation.^9 Firebase рекомендує project-specific `.env.<project>` для non-secret config і Secret Manager/`defineSecret()` для секретів.^10

### Test webhooks

Для кожного Test mode store:

- [x] URL: `https://us-central1-myfeedpilot-staging.cloudfunctions.net/lemonSqueezyWebhook`.
- [x] HTTPS.
- [x] Signing secret відповідає staging Secret Manager.
- [x] П’ять lifecycle events вибрані.
- [ ] Payment/refund events додати після появи окремих handlers.
- [ ] Виконати test delivery та побачити 200.
- [ ] Перевірити Resend того самого event: стан не дублюється і не регресує.
- [ ] Перевірити 500/retry: Lemon Squeezy робить до трьох повторів після першої спроби з приблизними затримками 5, 25, 125 секунд.^11
- [ ] Визначити retention webhook audit records.

Один secret на обидва stores у межах одного environment працює з поточним handler. Для кращої ізоляції production можна мати окремі secrets на store і перевіряти підпис проти контрольованого набору secrets; staging і production в будь-якому разі не повинні ділити один secret.

## 5. Checkout security checklist

### Уже правильно

- [x] Firebase Auth обов’язковий.
- [x] Client передає лише `interval` і `currency` з вузького enum.
- [x] Backend вибирає Store/Variant із власної allowlist.
- [x] Backend перевіряє наявний Pro перед новим checkout.
- [x] Email лише prefill, а identity визначається через server-owned checkout session.
- [x] Checkout відкривається у новій HTTPS tab.
- [x] API key ніколи не передається extension.

### Уже виправлено в поточній гілці

- [x] Небезпечний standard-link fallback із raw `user_id` прибрано.
- [x] Backend створює `billingCheckoutSessions/{randomOpaqueId}` із UID, store, variant, interval, currency та строком дії.
- [x] У checkout передається лише opaque `checkout_session_id`, а webhook дістає UID із server-owned session.
- [x] Session видаляється в тій самій транзакції після створення незмінної прив'язки `subscriptionId → uid`.

### Ще потрібно

- [x] API checkout має 30-хвилинний `expires_at`, а server-owned session — додаткові 5 хвилин лише для доставки webhook.^12
- [ ] Заборонити новий checkout не тільки для `active` і cancelled grace, а також для `past_due`; замість нього відкрити update-payment/customer portal.
- [ ] Вирішити поведінку для `unpaid`: update payment/resubscribe, не створюючи дві паралельні підписки без закриття старої.
- [ ] Додати per-UID rate limit/cooldown та abuse monitoring.
- [ ] Оцінити Firebase App Check для callable Functions. Enforcement відхиляє неатестовані виклики; replay protection доцільний для низькочастотних критичних операцій, але спочатку треба перевірити сумісний provider для Chrome extension.^13
- [ ] Перевіряти hostname URL, який повертає backend: дозволити тільки очікувані Lemon Squeezy/custom store domains, а не будь-який `https:`.
- [ ] Додати timeout до всіх Lemon Squeezy GET/POST, а не лише до POST `/checkouts`.
- [ ] Обробляти `429` з bounded retry/backoff або контрольованою помилкою. API limit — 300 requests/minute.^14
- [ ] Додати `redirect_url`/confirmation copy для UX, але не активувати Pro через redirect. Джерело істини — webhook.

Custom data офіційно призначена для зв’язування checkout із локальним користувачем і повертається у `meta.custom_data` order/subscription/license webhooks.^12 Для безпечної системи custom value має бути opaque server-owned session, а не client-editable authority.

## 6. Webhook security і reliability checklist

### Request boundary

- [x] Приймати тільки `POST`; інші methods → 405.
- [x] Читати `request.rawBody`, а не повторно serialized JSON.
- [x] Перевіряти HMAC SHA-256 через timing-safe comparison.
- [x] Перевіряти `Content-Type: application/json`.
- [ ] Обмежити допустимий body size.
- [x] Перевіряти, що `X-Event-Name` дорівнює `meta.event_name`.
- [x] Runtime schema validation для `meta`, `data.type`, `id`, attributes, статусів і дат.
- [ ] Невідомий event → 200 + audit `ignored_unknown_event`, а не тихе зникнення.
- [ ] Невідомий store/variant/test_mode mismatch → quarantine + alert із sanitized IDs.
- [ ] Не логувати raw payload, card data, email чи secrets.

### Idempotency та ordering

- [x] `providerUpdatedAt` відсікає явно старі payloads однієї поточної projection.
- [ ] Повтор тієї самої події не повинен створювати повторний invoice/history/action.
- [ ] Зберігати event fingerprint/status у `billingWebhookEvents`.
- [ ] Обробити рівні `updated_at`: зараз guard використовує `>`, тому дві події з однаковим timestamp можуть застосуватися в порядку доставки.
- [x] Не порівнювати timestamp різних subscription IDs як одну часову шкалу.
- [x] Додати deterministic entitlement aggregation rule.
- [x] Тестувати сценарій, у якому новіший `expired` старої підписки не перекриває іншу active.
- [ ] Тестувати duplicate, однакові timestamps та concurrent deliveries.

### Durability

- [ ] Спочатку durable-записати verified event, швидко повернути 200, потім обробити асинхронно/транзакційно.
- [ ] Зберігати sanitized payload або достатню projection для replay/debug.
- [x] `missing_user` не підтверджується успішним 200; Lemon Squeezy може повторити delivery.
- [ ] Dead-letter/quarantine для invalid mapping, missing checkout session, unknown variant та processing failures.
- [ ] Admin replay command із idempotency.
- [ ] Scheduled reconciliation: порівняти незавершені локальні subscriptions з Lemon Squeezy API й виправити пропущені webhooks.

Lemon Squeezy радить локально зберігати webhook events, швидко відповідати 200 і обробляти їх так, щоб дані не втрачались після вичерпання чотирьох доставок.^15 Firebase, зі свого боку, рекомендує idempotent Functions.^16

## 7. Правильна Firestore-модель

### Реалізована модель

Кожен provider subscription має власний документ, а сумісний aggregate-документ залишається джерелом entitlement для extension:

```text
billingCheckoutSessions/{sessionId}
  userId, storeId, variantId, interval, currency,
  checkoutExpiresAt, expiresAt, deleteAt

billingSubscriptions/{subscriptionId}
  userId, updatedAt

users/{uid}/billingSubscriptions/{subscriptionId}
  customerId, storeId, variantId, status, dates, testMode, providerUpdatedAt

users/{uid}/billing/subscription
  aggregate entitlement projection of the best current subscription
```

Майбутні reliability-модулі:

```text
billingWebhookEvents/{fingerprint}
  eventName, resourceType, resourceId, providerUpdatedAt,
  receivedAt, processingStatus, attempts, sanitizedError

billingInvoices/{invoiceId}
  uid, subscriptionId, status, amount, currency, billingReason, createdAt
```

Entitlement projection повинна агрегувати всі subscriptions користувача:

1. Якщо є хоча б одна `active`, `past_due` або cancelled-grace subscription — Pro.
2. `unpaid` враховувати за затвердженою policy.
3. Якщо немає жодної чинної — Free.
4. `expired` старої subscription ніколи не перекриває нову active.

### Rules та privacy

- [x] Власник може читати свій billing doc.
- [x] Client writes до `users/{uid}/billing/*` заборонені.
- [ ] Додати Emulator Rules tests: owner read success, other user read fail, owner write fail, anonymous read/write fail, global index/event collections fail.
- [ ] Переглянути `match /users/{userId} { allow read: if signedIn(); }`: будь-який signed-in user може читати root user docs інших користувачів. Це не відкриває billing subcollection автоматично, але є privacy risk.
- [ ] Переглянути загальнодоступність `emailIndex` для всіх signed-in users.

Firebase рекомендує автоматично тестувати Rules через Emulator Suite; Admin SDK обходить ці Rules, тому окремо тестуються client rules і backend authorization.^3

## 8. Automated test plan

### A. Pure unit tests — обов’язкові в кожному PR

#### Configuration

- [x] USD required, EUR optional only as complete triplet.
- [ ] `LEMON_SQUEEZY_TEST_MODE` приймає тільки точні `true` або `false`; typo зараз мовчки стає `false`.
- [ ] Staging startup/deploy fail, якщо `TEST_MODE !== true`.
- [ ] Production startup/deploy fail, якщо `TEST_MODE !== false`.
- [ ] Усі Store/Variant IDs numeric/non-empty/unique.
- [ ] Monthly і annual IDs не однакові.
- [ ] USD і EUR stores не переплутані.

#### Checkout API

- [x] Correct store/variant/custom data.
- [x] 422 не приховується fallback.
- [x] 500/429 не відкриває unsafe fallback.
- [x] Standard fallback більше не приймає raw UID, бо його видалено.
- [x] Checkout session створюється, перевіряється та одноразово видаляється після binding.
- [ ] API timeout, invalid JSON, missing URL, unsafe hostname.
- [ ] 401/403/404/422/429/5xx мають правильну user-facing категорію.
- [ ] Email відсутній/неверифікований.
- [ ] Existing `active`, `past_due`, cancelled grace блокують duplicate checkout.
- [ ] Existing `expired` дозволяє новий checkout.
- [ ] Два concurrent clicks створюють одну pending session/checkout.

#### Webhook signature та schema

- [x] Valid signature accepted; wrong length rejected.
- [ ] Tampered body, wrong secret, empty secret, missing header, uppercase/lowercase hex, malformed hex.
- [ ] Signature обчислюється саме над raw bytes з Unicode/whitespace.
- [ ] Header event mismatch.
- [ ] Wrong content type/oversized body.
- [ ] Missing `meta`, `data`, `attributes`, invalid dates/types.

#### Subscription mapping

- [x] Allowed USD/EUR stores and variants.
- [x] Wrong store/variant/test mode rejected.
- [x] Create/cancel/resume/expire mapping.
- [ ] `active`, `past_due`, `unpaid`, `expired`, `cancelled`, `on_trial`, `paused`, unknown status matrix.
- [ ] `trial_ends_at`, `order_id`, `product_id`, payment update URL if supported.
- [ ] Variant change monthly ↔ annual and USD/EUR policy.
- [ ] Null/invalid `renews_at`, `ends_at`, `updated_at`.
- [ ] Unknown additive fields do not break parsing (API backward compatibility).

#### Entitlements

- [x] Active/cancelled grace/expired basic cases.
- [ ] `past_due` remains Pro.
- [ ] `unpaid` follows documented product policy.
- [ ] Multiple subscriptions aggregate correctly.
- [ ] Boundary exactly at `endsAt === now`.
- [ ] Clock skew and invalid timestamps.
- [ ] Old expired + new active stays Pro.

### B. Repository transaction tests

Поточний test перевіряє лише object mapper, не реальну transaction behavior.

- [ ] First subscription creates index and subscription record.
- [ ] Duplicate delivery is idempotent.
- [ ] Older event ignored.
- [ ] Equal-time lifecycle events deterministic.
- [ ] Index cannot be rebound to another UID.
- [ ] Missing custom data recovers through index/session.
- [ ] Missing user/session quarantined.
- [ ] Concurrent events do not lose the newest state.
- [ ] Multiple subscription IDs do not overwrite each other.
- [ ] Projection recomputes correctly after cancel/expire/refund.
- [ ] Optional date fields are deleted on resume.

### C. Function integration tests via Emulator Suite

- [ ] Unauthenticated `createBillingCheckout` → `unauthenticated`.
- [ ] Invalid interval/currency → `invalid-argument`.
- [ ] Unsupported EUR config → `failed-precondition`.
- [ ] Existing qualifying subscription → `already-exists`.
- [ ] Lemon API success/error/timeout mapping.
- [ ] Unauthenticated portal call rejected.
- [ ] Missing subscription rejected.
- [ ] Portal API failure mapped safely.
- [ ] Webhook GET → 405; invalid signature → 401; ignored event → 200.
- [ ] Verified valid webhook writes expected Firestore docs.
- [ ] Processing failure persists event and retry/replay works.

### D. Firestore Rules tests

- [ ] Owner can read own entitlement/subscription.
- [ ] Other authenticated user cannot read it.
- [ ] Anonymous user cannot read it.
- [ ] No client can create/update/delete billing state.
- [ ] No client can read/write webhook events, sessions або global subscription index.
- [ ] Existing non-billing app paths remain unaffected.

### E. Extension UI tests

- [x] Free/Pro badge and no Free flash while loading.
- [x] Monthly/Annual selector and currency preference.
- [x] Checkout and Manage billing messages.
- [ ] `past_due`: Pro badge + payment warning + Update payment action.
- [ ] `unpaid`: policy-specific Free/limited UI + recovery action.
- [ ] `cancelled`: Pro badge + exact end date + Resume/manage action.
- [ ] `expired`: Free immediately after forced refresh.
- [ ] Portal unavailable/store pending activation: actionable message.
- [ ] Offline/Firestore error: do not flash wrong plan; show retry state.
- [ ] Sign out/in as different UID invalidates plan cache.
- [x] Підтверджена checkout-активація refresh-ить відкритий sidebar без reload і запускає Pro collection.
- [ ] Checkout tab blocked by browser/API error restores enabled CTA.
- [ ] Accessibility: keyboard, focus, aria-live, contrast, zoom 200%.

### F. Contract tests against Lemon Squeezy Test API

Запускати nightly або вручну із secrets, не в untrusted fork PR:

- [ ] API key `/users/me` працює в правильному mode.
- [ ] Кожен configured store існує й має expected currency/mode.
- [ ] Кожен variant належить expected store/product, published і має expected interval/price.
- [ ] Test webhook існує, active, має expected URL/events.
- [ ] API-created checkout повертає allowlisted HTTPS domain.
- [ ] Customer portal URL доступний для Test subscription.

### G. CI/CD gates

- [ ] Root install + `npm ci --prefix functions` у CI.
- [ ] `npm run type-check` для extension, dashboard і functions.
- [ ] `npm run test:extension`, `test:dashboard`, `test:functions`.
- [ ] `npm run build:functions`.
- [ ] Firestore Rules emulator tests.
- [ ] Secret scan і dependency audit.
- [ ] Staging config validation before deploy.
- [ ] Functions staging deploy прив’язаний до reviewed main commit.
- [ ] Production deploy має protected environment/manual approval.
- [ ] Extension production artifact і production Functions походять з одного commit/version.
- [ ] Rollback procedure протестована.

Поточний `.github/workflows/build-release.yml` встановлює й тестує extension, але не functions. `deploy-dashboard.yml` також не перевіряє functions. Це означає, що billing backend не є release gate.

## 9. Manual Test mode acceptance matrix

### Матриця checkout

Виконати всі чотири комбінації окремими test users або після повного cleanup:

| Currency | Interval | Expected amount | Store/variant verified | Webhook 200 | Firestore | UI |
|---|---|---:|---|---|---|---|
| USD | Monthly | $19/month | [ ] | [ ] | [ ] | [ ] |
| USD | Annual | $156/year | [ ] | [ ] | [ ] | [ ] |
| EUR | Monthly | €19/month | [ ] | [ ] | [ ] | [ ] |
| EUR | Annual | €156/year | [ ] | [ ] | [ ] | [ ] |

Для кожної покупки перевірити:

- Firebase UID збігається з server-side checkout session;
- правильні Store ID, Product ID, Variant ID, currency, interval;
- один order, одна subscription, один entitlement projection;
- Pro активується після webhook, не після redirect;
- повторний click не створює другу subscription;
- Manage billing відкриває портал правильного store/customer;
- email receipt/portal branding/support links правильні;
- податок і total пояснені користувачу;
- extension після restart знову бачить Pro.

### Payment cards

- [ ] Success Visa `4242 4242 4242 4242`.
- [ ] Mastercard `5555 5555 5555 4444`.
- [ ] Amex `3782 822463 10005`.
- [ ] Insufficient funds `4000 0000 0000 9995`: subscription не активується.
- [ ] Expired card `4000 0000 0000 0069`: коректна checkout error.
- [ ] 3D Secure `4000 0027 6000 3184`: успіх лише після authentication flow.

У Test mode заборонено використовувати реальну картку: Lemon Squeezy попереджає, що це може виглядати як fraud і призвести до suspension.^17

### Lifecycle

- [x] Create → Active → Pro.
- [x] Cancel → Cancelled → Pro до `ends_at`.
- [x] Resume до `ends_at` → Active → Pro, stale `endsAt` видалений.
- [x] Simulated Expired → Free.
- [ ] Update payment method → active state не губиться.
- [ ] Monthly ↔ Annual change → variant/interval/UI оновлюються, duplicate subscription не створюється.
- [ ] Payment failed attempt 1 → `past_due`, Pro залишається, banner з recovery action.
- [ ] Payment recovered → Active, banner прибраний.
- [ ] All retries exhausted → `unpaid`, policy застосована.
- [ ] Dunning success → Active/Pro.
- [ ] Dunning expiry → Expired/Free.
- [ ] Refund latest payment → audit + policy.
- [ ] Full initial order refund → audit + policy.
- [ ] Dispute open/resolved → alert + policy.

Для симуляції `subscription_payment_*` Lemon Squeezy потребує хоча б одного renewal. Офіційна порада — створити окремий Test-only daily-billing product/variant, купити його й дочекатися першого daily renewal; цей variant не додавати до production allowlist.^15

### Failure injection

- [ ] Webhook secret wrong → 401, Firestore без змін.
- [ ] Body changed after signing → 401.
- [ ] Live payload sent to staging → quarantine/reject, без змін.
- [ ] Wrong store/variant → quarantine/reject, без Pro.
- [ ] Missing/changed checkout session → quarantine, alert, без чужого Pro.
- [ ] Duplicate Resend ×3 → один logical result.
- [ ] Старий event після нового → no regression.
- [ ] Concurrent cancel/resume/update → final state відповідає provider API.
- [ ] Firestore temporarily unavailable → event retained/retried.
- [ ] Function timeout/500 → Lemon retry спрацьовує.
- [ ] Lemon API 429/500 → controlled checkout error/retry, без unsafe fallback.
- [ ] Offline extension → зрозумілий стан і recovery.
- [ ] User signs out during checkout, потім входить тим самим UID → Pro.
- [ ] User входить іншим Firebase UID з тим самим email → Pro не переноситься мовчки; є support recovery flow.

## 10. Production/Live checklist

### До першої реальної оплати

- [ ] Обидва stores activated; questionnaire і identity verification approved. Activation зазвичай потребує review, а test products не стають live автоматично.^18
- [ ] Payout bank/PayPal підключений.
- [ ] Terms of sale, refund policy, privacy policy, support email опубліковані.
- [ ] Test products copied to Live, потім вручну перевірені.
- [ ] Нові Live Store/Product/Variant IDs записані в `functions/.env.myfeedpilot-production` або захищену deployment config.
- [ ] `LEMON_SQUEEZY_TEST_MODE=false` у production і fail-fast guard.
- [ ] Окремий Live API key встановлений у production Secret Manager.
- [ ] Окремий production webhook secret встановлений.
- [ ] Live webhook для кожного store веде на production endpoint.
- [ ] Production Firebase Blaze, Rules, indexes і Functions deployed.
- [ ] Production Functions URL не посилається на staging/dev.
- [ ] `APP_ENV=production` artifact перевірений як unpacked extension.
- [ ] Monitoring, error alerts, budget alerts, maxInstances і log retention налаштовані.

Budget alert сам по собі **не зупиняє витрати**; це лише notification, якщо не використовується окремий spend cap/automation.^19 Поточний `maxInstances: 10` обмежує масштаб Function, але не є billing budget.

### Приватний live smoke test

1. Створити окремий production Firebase test account.
2. Зібрати unpublished/unpacked extension з `APP_ENV=production`.
3. Купити один Monthly plan реальною карткою у вже activated Live store.
4. Перевірити Live order/subscription, webhook 200, production Firestore, Pro UI, portal.
5. Негайно cancel subscription і перевірити grace period.
6. За затвердженою refund policy зробити refund та перевірити events/accounting.
7. Переконатися, що жодних Test IDs/data немає в production і навпаки.

Повного тесту acquiring/банку реальною карткою у Test mode не існує. Його роблять як контрольовану Live покупку в production infrastructure до публічного релізу extension.

## 11. Monitoring, support і operations

### Метрики й alerts

- [ ] Checkout requests/success/errors за currency/interval/error class.
- [ ] Webhook received/verified/processed/ignored/quarantined/failed.
- [ ] Webhook processing latency.
- [ ] Invalid signature spikes.
- [ ] Unknown store/variant/status/event.
- [ ] Missing checkout session/user mapping.
- [ ] Duplicate/out-of-order events.
- [ ] Active/past_due/unpaid/cancelled/expired counts.
- [ ] Payment failure/recovery/refund/dispute counts.
- [ ] Reconciliation drift between Lemon Squeezy and Firestore.
- [ ] Function 5xx, latency, instance count і cost anomalies.

### Runbooks

- [ ] «Webhook 401 after secret rotation».
- [ ] «Webhook 500 / deliveries exhausted».
- [ ] «Customer paid but remains Free».
- [ ] «Customer has duplicate subscriptions».
- [ ] «Wrong currency/store/variant».
- [ ] «Refund/dispute».
- [ ] «Account deleted while subscription active».
- [ ] «Transfer subscription to recovered Firebase account» з доказом ownership.
- [ ] «Lemon Squeezy/API outage».
- [ ] «Rotate compromised API key/webhook secret».

### Reconciliation

- [ ] Scheduled job отримує non-terminal local subscriptions через API.
- [ ] Порівнює provider `status`, variant, dates, cancelled, test_mode.
- [ ] Виправляє projection тільки після allowlist validation.
- [ ] Не перевищує API limit 300/min і використовує pagination/backoff.^14
- [ ] Пише audit trail і alert для divergence.

## 12. Chrome Web Store і privacy

- [ ] Privacy policy описує Firebase, Lemon Squeezy, authentication, LinkedIn data та billing metadata.
- [ ] Extension не збирає card number: card details вводяться тільки на hosted Lemon Squeezy checkout/portal.
- [ ] Terms/refund/cancellation policy доступні до покупки.
- [ ] Store listing чітко пояснює, які функції Free і які потребують Pro.
- [ ] CWS Privacy practices відповідають реальній поведінці та privacy policy.
- [ ] Усі manifest permissions обґрунтовані single purpose; зайві permissions видалені.
- [ ] Немає remote executable code; server responses містять дані/URLs, не JS-логіку.
- [ ] Sensitive/auth/payment data передаються тільки HTTPS.
- [ ] Data retention/deletion policy покриває billing records та account deletion.

Chrome Web Store вимагає точну privacy policy, мінімальні permissions, прозоре disclosure даних, безпечну обробку фінансових/auth даних і зрозумілі terms/refund policy для paid features.^20 Manifest V3 також забороняє remote executable code, але дозволяє server-side операції й синхронізацію account data.^21

## 13. Майбутній marketing website

Рекомендований flow не потребує license token:

1. Користувач входить на сайті через той самий Firebase Auth project.
2. Website викликає той самий `createBillingCheckout` callable.
3. Backend створює opaque checkout session для `request.auth.uid`.
4. Webhook зв’язує subscription із UID через server-owned session.
5. Extension входить у той самий Firebase account і читає entitlement.

Checklist:

- [ ] Website і extension використовують той самий production Firebase Auth tenant/project.
- [ ] Account linking/recovery для різних Google/email providers.
- [ ] Email verification policy.
- [ ] Checkout success page polling entitlement, але не самостійна активація.
- [ ] Cross-device sign-in test.
- [ ] Website CTA не містить публічного static checkout link без server session.
- [ ] Website і extension показують однакові price/plan data.

## 14. Поточний gap analysis за пріоритетом

### P0 — виправити до будь-якого Live smoke test

- [x] `past_due` → Pro entitlement і unit test.
- [ ] Додати payment failure warning/recovery action та end-to-end dunning tests.
- [x] Перейти від одного subscription doc до per-subscription records + aggregated entitlement.
- [ ] Закрити duplicate subscription сценарій.
- [x] Замінити raw UID standard checkout fallback на opaque server-owned checkout session і прибрати fallback.
- [x] Додати functions install/type-check/test/build у CI.
- [ ] Створити production non-secret config + Live secrets + Live webhooks.
- [x] Runtime webhook schema validation.

### P1 — до публічного production launch

- [ ] Durable webhook inbox/idempotency/quarantine/replay.
- [ ] Reconciliation job.
- [ ] Payment success/failed/recovered/refunded history handlers.
- [ ] Refund/dispute policy й handlers.
- [ ] Firestore Rules emulator tests.
- [ ] Callable integration tests.
- [ ] Rate limiting/App Check decision.
- [ ] Price/config validation against Lemon API.
- [ ] Monitoring alerts/runbooks.
- [ ] Privacy/terms/refund/CWS disclosure audit.

### P2 — операційна зрілість

- [ ] Automated secret rotation drill.
- [ ] Billing analytics/reporting.
- [ ] Self-service account recovery/transfer.
- [ ] Admin support tools із audit log.
- [ ] Chaos/failure tests і restore drill.

## 15. Definition of Done

Billing integration готова до production лише якщо одночасно виконано:

- [ ] Усі P0 закриті тестами.
- [ ] CI перевіряє весь monorepo, Functions і Rules.
- [ ] 4 Test mode checkout комбінації успішні.
- [ ] Decline + 3DS + duplicate + out-of-order + retry scenarios пройдені.
- [ ] Cancel/resume/expire/past_due/recovery/unpaid/refund policies пройдені.
- [ ] Firestore не дозволяє client promotion.
- [ ] Staging і Production конфігураційно ізольовані.
- [ ] Live products/webhooks/secrets створені окремо.
- [ ] Один приватний real-card production smoke test пройдений.
- [ ] Alerts, reconciliation і support runbooks готові.
- [ ] Privacy, terms, refund policy та CWS disclosures опубліковані.

## Джерела

1. Lemon Squeezy. [Testing & Going Live](https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live).
2. Lemon Squeezy. [Signing Requests](https://docs.lemonsqueezy.com/help/webhooks/signing-requests).
3. Firebase. [Test your Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/test-rules-emulator).
4. Lemon Squeezy. [Recovery and Dunning](https://docs.lemonsqueezy.com/help/online-store/recovery-dunning).
5. Lemon Squeezy. [Subscriptions](https://docs.lemonsqueezy.com/help/products/subscriptions).
6. Lemon Squeezy. [Subscription Management using the Lemon Squeezy API](https://docs.lemonsqueezy.com/guides/developer-guide/managing-subscriptions).
7. Lemon Squeezy. [Webhook Event Types](https://docs.lemonsqueezy.com/help/webhooks/event-types).
8. Lemon Squeezy. [Tax Categories](https://docs.lemonsqueezy.com/help/products/tax-categories).
9. Lemon Squeezy. [Getting Started with the API](https://docs.lemonsqueezy.com/guides/developer-guide/getting-started).
10. Firebase. [Configure your environment](https://firebase.google.com/docs/functions/config-env).
11. Lemon Squeezy. [Webhook Requests](https://docs.lemonsqueezy.com/help/webhooks/webhook-requests).
12. Lemon Squeezy. [Taking Payments](https://docs.lemonsqueezy.com/guides/developer-guide/taking-payments).
13. Firebase. [Enable App Check enforcement for Cloud Functions](https://firebase.google.com/docs/app-check/cloud-functions).
14. Lemon Squeezy. [API Reference and Rate Limiting](https://docs.lemonsqueezy.com/api).
15. Lemon Squeezy. [Sync With Webhooks](https://docs.lemonsqueezy.com/guides/developer-guide/webhooks).
16. Firebase. [Cloud Functions Tips: Write idempotent functions](https://firebase.google.com/docs/functions/tips).
17. Lemon Squeezy. [Test Mode and Test Cards](https://docs.lemonsqueezy.com/help/getting-started/test-mode).
18. Lemon Squeezy. [Activate Your Store](https://docs.lemonsqueezy.com/help/getting-started/activate-your-store).
19. Google Cloud. [Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets).
20. Chrome for Developers. [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies).
21. Chrome for Developers. [Additional Requirements for Manifest V3](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements).
