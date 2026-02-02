const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
require('dotenv').config();

// Конфигурация - получаем переменные из окружения
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
const PORT = process.env.PORT || 3000;

// Автоматически определяем URL для Web App
const WEB_APP_URL = RENDER_EXTERNAL_URL ? `${RENDER_EXTERNAL_URL}/` : `http://localhost:${PORT}/`;

console.log('🔧 Конфигурация:');
console.log('TELEGRAM_TOKEN:', TELEGRAM_TOKEN ? 'Установлен' : 'Не установлен');
console.log('RENDER_EXTERNAL_URL:', RENDER_EXTERNAL_URL || 'Не установлен');
console.log('PORT:', PORT);
console.log('WEB_APP_URL:', WEB_APP_URL);

// Проверяем обязательные переменные
if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('❌ ОШИБКА: TELEGRAM_TOKEN не установлен!');
    console.error('Добавьте TELEGRAM_TOKEN в Environment Variables на Render.com');
    process.exit(1);
}

// Инициализация бота с опциями для Render
const bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: true,
    request: {
        agentOptions: {
            keepAlive: true,
            family: 4 // Используем только IPv4
        }
    }
});

const app = express();

// Middleware для логирования запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Раздаем статические файлы из текущей директории
app.use(express.static(__dirname));

// Главная страница (веб-приложение)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint для Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'TimeCalc Telegram Bot',
        webAppUrl: WEB_APP_URL
    });
});

// API endpoint для расчета времени (можно использовать извне)
app.get('/api/calculate', express.json(), (req, res) => {
    const expression = req.query.expr;

    if (!expression) {
        return res.status(400).json({
            error: 'Параметр expr обязателен'
        });
    }

    try {
        const result = calculateFromExpression(expression);
        res.json(result);
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
});

// Функции для расчета времени (такие же как в script.js)
function parseTimeExpression(expr) {
    // Нормализация: заменяем запятые на точки
    expr = expr.replace(/(\d),(\d)/g, '$1.$2');

    // Обработка скобок
    const bracketRegex = /\(([^()]+)\)/g;
    let resultExpr = expr;
    let bracketMatch;

    while ((bracketMatch = bracketRegex.exec(expr)) !== null) {
        const innerExpr = bracketMatch[1];
        try {
            const innerResult = parseTimeExpression(innerExpr);
            resultExpr = resultExpr.replace(bracketMatch[0], innerResult.toString() + 'мин');
        } catch (error) {
            throw new Error(`Ошибка в скобках "${innerExpr}": ${error.message}`);
        }
    }

    // Нормализация единиц измерения
    resultExpr = resultExpr.replace(/(\d+)\s+(час[ао]?в?)/gi, '$1ч');
    resultExpr = resultExpr.replace(/(\d+)\s+(минут[ы]?)/gi, '$1мин');
    resultExpr = resultExpr.replace(/(\d+(?:\.\d+)?)\s+(ч)/gi, '$1$2');
    resultExpr = resultExpr.replace(/(\d+)\s+(мин)/gi, '$1$2');

    // Обработка диапазонов вида HH:MM-HH:MM
    const rangeRegex = /(\d{1,2}:\d{1,2})\s*-\s*(\d{1,2}:\d{1,2})/g;
    let match;

    while ((match = rangeRegex.exec(resultExpr)) !== null) {
        const start = timeToMinutes(match[1]);
        const end = timeToMinutes(match[2]);

        if (start !== null && end !== null) {
            let diff = end - start;
            if (diff < 0) diff += 24 * 60;
            resultExpr = resultExpr.replace(match[0], diff.toString() + 'мин');
        }
    }

    // Добавляем пробелы вокруг операторов
    resultExpr = resultExpr.replace(/([+\-])/g, ' $1 ');

    // Разбиваем на токены
    const tokens = resultExpr.split(/\s+/).filter(t => t.length > 0);
    let totalMinutes = 0;
    let currentSign = 1;

    for (let token of tokens) {
        if (token === '+') {
            currentSign = 1;
            continue;
        }

        if (token === '-') {
            currentSign = -1;
            continue;
        }

        const minutes = parseTimeToken(token);
        if (minutes !== null) {
            totalMinutes += currentSign * minutes;
        } else {
            throw new Error(`Не распознано: "${token}"`);
        }
    }

    return totalMinutes;
}

function parseTimeToken(token) {
    // Удаляем 'мин' из обработанных диапазонов
    if (token.endsWith('мин')) {
        const num = token.slice(0, -3);
        if (!isNaN(num) && num !== '') return parseFloat(num);
    }

    // Формат HH:MM или H:MM
    const timeMatch = token.match(/^(\d{1,2}):(\d{1,2})$/);
    if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            return hours * 60 + minutes;
        }
    }

    // Десятичные часы
    const decimalMatch = token.match(/^(\d+(?:\.\d+)?)$/);
    if (decimalMatch) {
        const hours = parseFloat(decimalMatch[1]);
        return Math.round(hours * 60);
    }

    // Часы с суффиксом
    const hourMatch = token.match(/^(\d+(?:\.\d+)?)(?:ч|h)$/i);
    if (hourMatch) {
        const hours = parseFloat(hourMatch[1]);
        return Math.round(hours * 60);
    }

    // Минуты с суффиксом
    const minuteMatch = token.match(/^(\d+)(?:мин|m)$/i);
    if (minuteMatch) {
        return parseInt(minuteMatch[1], 10);
    }

    // Часы и минуты
    const hourMinMatch = token.match(/^(\d+)(?:ч|h)(\d+)(?:мин|m)$/i);
    if (hourMinMatch) {
        const hours = parseInt(hourMinMatch[1], 10);
        const minutes = parseInt(hourMinMatch[2], 10);
        return hours * 60 + minutes;
    }

    // Просто число (минуты)
    if (/^\d+$/.test(token)) {
        return parseInt(token, 10);
    }

    return null;
}

function timeToMinutes(timeStr) {
    const parts = timeStr.split(':');
    if (parts.length !== 2) return null;

    let hours = parseInt(parts[0], 10);
    let minutes = parseInt(parts[1], 10);

    if (parts[1].length === 1) {
        minutes = parseInt(parts[1], 10);
    }

    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        return hours * 60 + minutes;
    }

    return null;
}

function formatResults(minutes) {
    if (isNaN(minutes) || minutes === null) {
        return {
            hoursMinutes: '—',
            decimalDot: '—',
            decimalComma: '—',
            minutes: '—',
            seconds: '—',
            error: 'Некорректный результат расчета'
        };
    }

    const totalMinutes = Math.abs(minutes);
    const sign = minutes < 0 ? "-" : "";

    // Часы и минуты
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hoursMinutes = hours === 0 ?
        `${sign}${mins} мин` :
        mins === 0 ?
        `${sign}${hours} ч` :
        `${sign}${hours} ч ${mins} мин`;

    // Десятичные часы
    const decimalHours = (totalMinutes / 60).toFixed(2);
    const decimalDot = `${sign}${decimalHours}`;
    const decimalComma = `${sign}${decimalHours.replace('.', ',')}`;

    // Минуты и секунды
    const totalMins = `${sign}${totalMinutes}`;
    const seconds = `${sign}${totalMinutes * 60}`;

    return {
        success: true,
        expression: '',
        hoursMinutes,
        decimalDot,
        decimalComma,
        minutes: totalMins,
        seconds,
        totalMinutes: totalMinutes * (minutes < 0 ? -1 : 1)
    };
}

function calculateFromExpression(expression) {
    try {
        const totalMinutes = parseTimeExpression(expression);

        if (isNaN(totalMinutes)) {
            throw new Error('Некорректный результат расчета');
        }

        const result = formatResults(totalMinutes);
        result.expression = expression;

        return result;
    } catch (error) {
        return {
            success: false,
            error: error.message,
            expression: expression
        };
    }
}

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
    ).catch(error => {
        console.error('Ошибка отправки /start:', error);
    });
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
    ).catch(error => {
        console.error('Ошибка отправки /help:', error);
    });
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
    ).catch(error => {
        console.error('Ошибка отправки /examples:', error);
    });
});

bot.onText(/\/calc (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const expression = match[1];

    console.log(`Расчет выражения: ${expression} для чата ${chatId}`);

    try {
        // Используем ту же логику парсинга, что и в веб-приложении
        const result = calculateFromExpression(expression);

        if (!result.success) {
            bot.sendMessage(chatId, `❌ Ошибка: ${result.error}\n\nПопробуйте: /examples`).catch(console.error);
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
            ).catch(error => {
                console.error('Ошибка отправки результата:', error);
            });
        }
    } catch (error) {
        console.error('Ошибка расчета:', error);
        bot.sendMessage(chatId, `❌ Ошибка расчета: ${error.message}\n\nПопробуйте: /examples`).catch(console.error);
    }
});

// Обработка сообщений с веб-приложения (данные, отправленные из Web App)
bot.on('message', (msg) => {
    // Проверяем, есть ли данные от веб-приложения
    if (msg.web_app_data) {
        const chatId = msg.chat.id;
        const data = msg.web_app_data.data;

        try {
            const result = calculateFromExpression(data);

            if (result.success) {
                bot.sendMessage(chatId,
                    `📋 *Скопировано из веб-приложения:*\n\n` +
                    `Выражение: \`${data}\`\n` +
                    `Результат: ${result.hoursMinutes}`, {
                        parse_mode: 'Markdown'
                    }
                ).catch(console.error);
            }
        } catch (error) {
            console.error('Ошибка обработки данных из web app:', error);
        }
    }
});

// Обработка ошибок бота
bot.on('polling_error', (error) => {
    console.error('❌ Ошибка polling Telegram Bot:', error.message);
    console.error('Код ошибки:', error.code);

    // Перезапускаем polling через 5 секунд при ошибке
    setTimeout(() => {
        console.log('🔄 Перезапуск polling...');
        bot.startPolling();
    }, 5000);
});

bot.on('webhook_error', (error) => {
    console.error('Ошибка webhook:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершаем работу...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Получен SIGINT, завершаем работу...');
    bot.stopPolling();
    process.exit(0);
});

// Запуск сервера
const server = app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Веб-приложение доступно по адресу: ${WEB_APP_URL}`);
    console.log(`🩺 Health check: ${WEB_APP_URL}health`);
    console.log(`🤖 Бот запущен и готов к работе!`);

    // Отправляем информацию в лог о успешном запуске
    console.log('✅ TimeCalc Bot успешно запущен на Render.com');
});

// Обработка ошибок сервера
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Порт ${PORT} уже занят!`);
        process.exit(1);
    } else {
        console.error('❌ Ошибка сервера:', error);
    }
});