const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
require('dotenv').config();

// Конфигурация
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL; // URL вашего веб-приложения
const PORT = process.env.PORT || 3000;

// Инициализация бота
const bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: true
});
const app = express();

// Раздаем статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработка команд бота
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const keyboard = {
        inline_keyboard: [
            [{
                text: '📱 Открыть TimeCalc',
                web_app: {
                    url: WEB_APP_URL
                }
            }]
        ]
    };

    bot.sendMessage(chatId,
        '🕒 *TimeCalc - Универсальный калькулятор времени*\n\n' +
        'Сложение, вычитание и конвертация времени в любых форматах:\n' +
        '• Диапазоны: `09:05-11:26`\n' +
        '• Часы: `1.5ч`, `1,5 часа`\n' +
        '• Минуты: `45 минут`, `30 мин`\n' +
        '• Сложные выражения: `8:30 - 0:45 + 1.25ч`\n\n' +
        'Нажмите кнопку ниже, чтобы открыть калькулятор!', {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        }
    );
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        '📖 *Помощь по TimeCalc*\n\n' +
        '*Поддерживаемые форматы:*\n' +
        '• `09:05-11:26` - диапазон времени\n' +
        '• `12:24 + 17 минут` - сложение\n' +
        '• `8:30 - 0:45 + 1.25ч` - комбинирование\n' +
        '• `23:45-01:15` - ночной переход\n\n' +
        '*Другие команды:*\n' +
        '/start - запустить бота\n' +
        '/examples - примеры выражений\n' +
        '/calc <выражение> - быстрый расчет', {
            parse_mode: 'Markdown'
        }
    );
});

bot.onText(/\/examples/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        '📝 *Примеры выражений:*\n\n' +
        '`09:05-11:26`\n' +
        '`14:21-21:30+08:00-12:00`\n' +
        '`12:24 + 17 минут`\n' +
        '`01:30 + 35 мин`\n' +
        '`02:35 + 1,35 ч`\n' +
        '`8:30 - 0:45 + 1.25 часа`\n' +
        '`2 часа 15 минут + 45 мин`\n' +
        '`3.5ч - 1ч20мин`\n' +
        '`23:45-01:15`\n' +
        '`1:45 + 0.75ч - 30 мин`\n\n' +
        'Используйте /calc <выражение> для быстрого расчета.', {
            parse_mode: 'Markdown'
        }
    );
});

bot.onText(/\/calc (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const expression = match[1];

    try {
        // Используем ту же логику парсинга, что и в веб-приложении
        const result = calculateFromExpression(expression);

        if (result.error) {
            bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        } else {
            bot.sendMessage(chatId,
                `✅ *Результат:*\n\n` +
                `Выражение: \`${expression}\`\n` +
                `Часы и минуты: ${result.hoursMinutes}\n` +
                `Десятичные часы: ${result.decimalDot}\n` +
                `Минуты: ${result.minutes}\n` +
                `Секунды: ${result.seconds}\n\n` +
                `Для более удобного использования откройте веб-приложение:`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{
                                text: '📱 Открыть TimeCalc',
                                web_app: {
                                    url: WEB_APP_URL
                                }
                            }]
                        ]
                    }
                }
            );
        }
    } catch (error) {
        bot.sendMessage(chatId, `❌ Ошибка расчета: ${error.message}`);
    }
});

// Функция расчета (та же логика, что и на фронтенде)
function calculateFromExpression(expr) {
    // Имплементация функций parseTimeExpression и formatResults
    // ... (копируем сюда те же функции, что и в script.js)
}

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Веб-приложение доступно по адресу: http://localhost:${PORT}`);
});

// Обработка ошибок
bot.on('polling_error', (error) => {
    console.error('Ошибка polling:', error);
});

console.log('🤖 Бот запущен...');