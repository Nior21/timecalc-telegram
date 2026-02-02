// Состояние приложения
const state = {
    inputValue: '',
    examplesCollapsed: false,
    lastCalculation: null
};

// Проверка, запущено ли в Telegram Web App
const isTelegramWebApp = () => {
    return window.Telegram && window.Telegram.WebApp;
};

// Инициализация из localStorage
function initFromStorage() {
    try {
        const savedInput = localStorage.getItem('timecalc_input');
        if (savedInput) {
            document.getElementById('timeInput').value = savedInput;
            state.inputValue = savedInput;
        }
        
        const savedCollapsed = localStorage.getItem('timecalc_examples_collapsed');
        if (savedCollapsed === 'true') {
            state.examplesCollapsed = true;
            document.getElementById('examplesSection').classList.add('collapsed');
            document.getElementById('examplesToggle').classList.add('collapsed');
        }
    } catch (e) {
        console.warn('Не удалось загрузить данные:', e);
    }
}

// Сохранение в localStorage
function saveToStorage() {
    try {
        localStorage.setItem('timecalc_input', state.inputValue);
        localStorage.setItem('timecalc_examples_collapsed', state.examplesCollapsed);
    } catch (e) {
        console.warn('Не удалось сохранить данные:', e);
    }
}

// Основная функция парсинга времени
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

// Парсинг отдельного токена времени
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

// Конвертация времени в минуты
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

// Форматирование результатов
function formatResults(minutes) {
    if (isNaN(minutes) || minutes === null) {
        return {
            hoursMinutes: '—',
            decimalDot: '—',
            decimalComma: '—',
            minutes: '—',
            seconds: '—'
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
        hoursMinutes,
        decimalDot,
        decimalComma,
        minutes: totalMins,
        seconds
    };
}

// Обновление интерфейса
function updateUI(minutes, success = true, errorMessage = '') {
    const statusContainer = document.getElementById('statusContainer');
    
    if (success && !isNaN(minutes)) {
        const results = formatResults(minutes);
        
        document.getElementById('resultHoursMinutes').innerHTML = 
            `<span>${results.hoursMinutes}</span><span class="copy-icon">📋</span>`;
        document.getElementById('resultDecimalDot').innerHTML = 
            `<span>${results.decimalDot}</span><span class="copy-icon">📋</span>`;
        document.getElementById('resultDecimalComma').innerHTML = 
            `<span>${results.decimalComma}</span><span class="copy-icon">📋</span>`;
        document.getElementById('resultMinutes').innerHTML = 
            `<span>${results.minutes}</span><span class="copy-icon">📋</span>`;
        document.getElementById('resultSeconds').innerHTML = 
            `<span>${results.seconds}</span><span class="copy-icon">📋</span>`;
        
        statusContainer.className = 'status-message status-success';
        statusContainer.innerHTML = `
            <svg class="status-icon" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <span>Расчет выполнен</span>
        `;
        statusContainer.style.display = 'flex';
    } else {
        // Очищаем значения при ошибке
        const outputCards = document.querySelectorAll('.output-card');
        outputCards.forEach(card => {
            const valueElement = card.querySelector('.output-value');
            valueElement.innerHTML = '<span>—</span><span class="copy-icon">📋</span>';
        });
        
        statusContainer.className = 'status-message status-error';
        statusContainer.innerHTML = `
            <svg class="status-icon" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            <span>${errorMessage || 'Ошибка расчета'}</span>
        `;
        statusContainer.style.display = 'flex';
    }
    
    state.lastCalculation = { minutes, success, timestamp: Date.now() };
}

// Выполнение расчета
function calculate() {
    const input = document.getElementById('timeInput').value.trim();
    state.inputValue = input;
    saveToStorage();
    
    if (!input) {
        // Если поле пустое, показываем пустое состояние
        const outputCards = document.querySelectorAll('.output-card');
        outputCards.forEach(card => {
            const valueElement = card.querySelector('.output-value');
            const label = card.querySelector('.output-label').textContent;
            const defaultValue = label.includes('секунд') ? '0' : 
                               label.includes('минут') ? '0' : 
                               label.includes('точк') ? '0.00' : 
                               label.includes('запят') ? '0,00' : '0 ч 0 мин';
            valueElement.innerHTML = `<span>${defaultValue}</span><span class="copy-icon">📋</span>`;
        });
        
        document.getElementById('statusContainer').style.display = 'none';
        return;
    }
    
    try {
        const totalMinutes = parseTimeExpression(input);
        if (isNaN(totalMinutes)) {
            throw new Error('Некорректный результат расчета');
        }
        updateUI(totalMinutes, true);
    } catch (error) {
        updateUI(NaN, false, error.message);
    }
}

// Копирование в буфер обмена
function copyToClipboard(text, element) {
    if (text === '—') return;
    
    // В Telegram Web App используем специальный метод
    if (isTelegramWebApp()) {
        window.Telegram.WebApp.sendData(text);
        const originalHTML = element.innerHTML;
        element.classList.add('copied');
        element.innerHTML = originalHTML.replace('📋', '✓');
        
        setTimeout(() => {
            element.classList.remove('copied');
            element.innerHTML = originalHTML;
        }, 1500);
        return;
    }
    
    // В браузере используем стандартный API
    navigator.clipboard.writeText(text).then(() => {
        const originalHTML = element.innerHTML;
        element.classList.add('copied');
        element.innerHTML = originalHTML.replace('📋', '✓');
        
        setTimeout(() => {
            element.classList.remove('copied');
            element.innerHTML = originalHTML;
        }, 1500);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        const originalHTML = element.innerHTML;
        element.classList.add('copied');
        element.innerHTML = originalHTML.replace('📋', '✓');
        
        setTimeout(() => {
            element.classList.remove('copied');
            element.innerHTML = originalHTML;
        }, 1500);
    });
}

// Показ/скрытие модального окна
function showHelpModal() {
    document.getElementById('helpModal').classList.add('active');
    if (isTelegramWebApp()) {
        window.Telegram.WebApp.disableClosingConfirmation();
    }
}

function hideHelpModal() {
    document.getElementById('helpModal').classList.remove('active');
    if (isTelegramWebApp()) {
        window.Telegram.WebApp.enableClosingConfirmation();
    }
}

// Инициализация Telegram Web App
function initTelegramWebApp() {
    if (isTelegramWebApp()) {
        // Добавляем класс для Telegram
        document.body.classList.add('tg');
        
        // Настраиваем Web App
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        window.Telegram.WebApp.setHeaderColor('#1a73e8');
        window.Telegram.WebApp.setBackgroundColor('#ffffff');
        window.Telegram.WebApp.enableClosingConfirmation();
        
        // Скрываем плавающую кнопку в Telegram
        document.getElementById('floatingHelpBtn').style.display = 'none';
        
        console.log('Telegram Web App инициализирован');
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация Telegram Web App (если запущено в Telegram)
    initTelegramWebApp();
    
    // Восстановление состояния
    initFromStorage();
    
    // Элементы
    const timeInput = document.getElementById('timeInput');
    const clearBtn = document.getElementById('clearBtn');
    const helpBtn = document.getElementById('helpBtn');
    const floatingHelpBtn = document.getElementById('floatingHelpBtn');
    const examplesToggle = document.getElementById('examplesToggle');
    const examplesSection = document.getElementById('examplesSection');
    const closeModal = document.getElementById('closeModal');
    const exampleItems = document.querySelectorAll('.example-item');
    
    // Фокус на поле ввода
    setTimeout(() => {
        timeInput.focus();
    }, 300);
    
    // Назначение обработчиков
    timeInput.addEventListener('input', () => {
        clearTimeout(window.inputTimeout);
        window.inputTimeout = setTimeout(calculate, 300);
    });
    
    timeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            calculate();
        }
    });
    
    clearBtn.addEventListener('click', () => {
        timeInput.value = '';
        timeInput.focus();
        calculate();
    });
    
    // Обработчики для подсказки
    helpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showHelpModal();
    });
    
    floatingHelpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showHelpModal();
    });
    
    closeModal.addEventListener('click', hideHelpModal);
    document.getElementById('helpModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            hideHelpModal();
        }
    });
    
    // Обработчик для сворачивания примеров
    examplesToggle.addEventListener('click', () => {
        state.examplesCollapsed = !state.examplesCollapsed;
        examplesSection.classList.toggle('collapsed', state.examplesCollapsed);
        examplesToggle.classList.toggle('collapsed', state.examplesCollapsed);
        
        saveToStorage();
    });
    
    // Обработчики для примеров
    exampleItems.forEach(item => {
        item.addEventListener('click', () => {
            timeInput.value = item.textContent;
            timeInput.focus();
            calculate();
        });
    });
    
    // Обработчики для копирования результатов
    document.querySelectorAll('.output-value').forEach(element => {
        element.addEventListener('click', (e) => {
            if (e.target.classList.contains('output-value') || 
                e.target.parentElement.classList.contains('output-value')) {
                const text = element.querySelector('span:first-child').textContent;
                if (text !== '—') {
                    copyToClipboard(text, element);
                }
            }
        });
    });
    
    // Первоначальный расчет, если есть сохраненное значение
    if (state.inputValue) {
        calculate();
    }
    
    // Обработка нажатия Escape для закрытия модалки
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideHelpModal();
        }
    });
});