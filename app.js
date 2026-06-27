import * as THREE from 'three';

// ========== DASHBOARD GLOBAL STATE ==========
let activeState = 'Healthy';
let heartRate = 72;
let systolicBP = 120;
let diastolicBP = 80;
let bloodOxygen = 98;
let temperature = 36.7;
let glucose = 105;
let respRate = 14;

let riskPercentage = 12;
let clinicalRisk = 10;
let lifestyleRisk = 15;

let isExternalSource = false;
let lastExternalTimestamp = null;
let currentConnectedWearable = null;

// History for sparklines
const vitalHistory = {
    heartRate: Array(20).fill(72),
    bloodPressure: Array(20).fill(120),
    bloodOxygen: Array(20).fill(98),
    temperature: Array(20).fill(36.7),
    glucose: Array(20).fill(105),
    respRate: Array(20).fill(14)
};

// Sparkline canvas contexts
const sparklines = {};

// Active alerts log cache (to avoid duplicate notifications)
const triggeredAlerts = new Set();

// ========== DOM ELEMENTS ==========
const els = {
    simBtns: document.querySelectorAll('.sim-btn'),
    netStatusIndicator: document.getElementById('netStatusIndicator'),
    netStatusText: document.getElementById('netStatusText'),
    streamSourceBadge: document.getElementById('streamSourceBadge'),
    patientStatusBadge: document.getElementById('patientStatusBadge'),
    
    // Vitals Display values
    val_heartRate: document.getElementById('val-heartRate'),
    val_bloodPressure: document.getElementById('val-bloodPressure'),
    val_bloodOxygen: document.getElementById('val-bloodOxygen'),
    val_temperature: document.getElementById('val-temperature'),
    val_glucose: document.getElementById('val-glucose'),
    val_respRate: document.getElementById('val-respRate'),
    
    // AI Risk Engine
    riskLevelTag: document.getElementById('riskLevelTag'),
    riskPercentageText: document.getElementById('riskPercentageText'),
    clinicalRiskText: document.getElementById('clinicalRiskText'),
    lifestyleRiskText: document.getElementById('lifestyleRiskText'),
    recommendationsList: document.getElementById('recommendationsList'),
    riskRing: document.getElementById('riskRing'),
    
    // Wearable Console
    wearableConnText: document.getElementById('wearableConnText'),
    wdApple: document.getElementById('wd-apple'),
    wdFitbit: document.getElementById('wd-fitbit'),
    wdGarmin: document.getElementById('wd-garmin'),
    
    // Logs and Appointments
    anomalyFeed: document.getElementById('anomalyFeed'),
    feedEmptyState: document.getElementById('feedEmptyState'),
    alertBadge: document.getElementById('alertBadge'),
    medTableBody: document.getElementById('medTableBody'),
    
    // Modal
    openGuideBtn: document.getElementById('openGuideBtn'),
    closeGuideBtn: document.getElementById('closeGuideBtn'),
    closeGuideBtn2: document.getElementById('closeGuideBtn2'),
    guideModal: document.getElementById('guideModal'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    
    // Overlay pulse text
    pulseBpmText: document.getElementById('pulseBpmText')
};

// ========== INITIALIZE DASHBOARD ==========
function init() {
    setupSimulationControls();
    setupSparklines();
    setupEcgMonitor();
    setupThreeJSHeart();
    setupWearableGuideModal();
    renderMedications(defaultMedications);
    
    // Request desktop notification permissions
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Initial run
    updateVitalsLoop();
    
    // Run loops
    setInterval(updateVitalsLoop, 2000);
    setInterval(pollExternalIngress, 3000); // Check server history for external telemetry
}

// ========== SIMULATOR STATES DEFINITION ==========
const physiologicalStates = {
    Healthy: {
        hr: () => randomInt(68, 75),
        bp: () => `${randomInt(115, 122)}/${randomInt(75, 80)}`,
        spo2: () => randomInt(97, 99),
        temp: () => roundTo(randomFloat(36.5, 36.8), 1),
        glucose: () => randomInt(90, 105),
        resp: () => randomInt(12, 16),
        badgeClass: 'stable',
        badgeText: 'Stable'
    },
    Exercising: {
        hr: () => randomInt(130, 145),
        bp: () => `${randomInt(132, 142)}/${randomInt(82, 88)}`,
        spo2: () => randomInt(98, 100),
        temp: () => roundTo(randomFloat(37.1, 37.4), 1),
        glucose: () => randomInt(80, 92),
        resp: () => randomInt(22, 26),
        badgeClass: 'stable',
        badgeText: 'Active'
    },
    Stressed: {
        hr: () => randomInt(102, 114),
        bp: () => `${randomInt(142, 154)}/${randomInt(92, 98)}`,
        spo2: () => randomInt(96, 98),
        temp: () => roundTo(randomFloat(36.7, 37.0), 1),
        glucose: () => randomInt(115, 130),
        resp: () => randomInt(16, 20),
        badgeClass: 'warning',
        badgeText: 'Elevated'
    },
    Arrhythmia: {
        hr: () => (Math.random() > 0.4 ? randomInt(55, 68) : randomInt(95, 115)), // wild spikes/drops
        bp: () => `${randomInt(110, 130)}/${randomInt(70, 88)}`,
        spo2: () => randomInt(94, 96),
        temp: () => roundTo(randomFloat(36.5, 36.8), 1),
        glucose: () => randomInt(95, 110),
        resp: () => randomInt(14, 17),
        badgeClass: 'warning',
        badgeText: 'Arrhythmic'
    },
    'Myocardial Infarction': {
        hr: () => randomInt(112, 126),
        bp: () => (Math.random() > 0.5 ? `${randomInt(155, 175)}/${randomInt(102, 115)}` : `${randomInt(85, 95)}/${randomInt(55, 62)}`), // shock or high BP
        spo2: () => randomInt(88, 92), // Hypoxia
        temp: () => roundTo(randomFloat(36.2, 36.6), 1),
        glucose: () => randomInt(132, 155),
        resp: () => randomInt(24, 29), // Labored breathing
        badgeClass: 'critical',
        badgeText: 'Critical Event'
    }
};

// Medication schedule static array
const defaultMedications = [
    { id: 1, name: "Metformin", dosage: "500mg", time: "08:00 AM", type: "tablet", status: "taken", takenAt: "08:05 AM" },
    { id: 2, name: "Lisinopril", dosage: "10mg", time: "09:00 AM", type: "tablet", status: "pending" },
    { id: 3, name: "Atorvastatin", dosage: "20mg", time: "08:00 PM", type: "tablet", status: "pending" },
    { id: 4, name: "Aspirin", dosage: "81mg", time: "07:00 AM", type: "tablet", status: "taken", takenAt: "07:10 AM" }
];

function setupSimulationControls() {
    els.simBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Revert back to local simulation if user overrides via buttons
            isExternalSource = false;
            currentConnectedWearable = null;
            els.streamSourceBadge.innerHTML = `<i class="fas fa-desktop"></i> IoT Stream: Local Simulator`;
            els.streamSourceBadge.style.borderColor = '';
            els.streamSourceBadge.style.color = '';
            
            els.simBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeState = btn.getAttribute('data-state');
            
            // Clear warning link styles
            updateWearableStatusUI();
            updateVitalsLoop();
        });
    });
}

function updateWearableStatusUI() {
    // Reset all
    els.wearableConnText.className = 'connection-status offline';
    els.wearableConnText.textContent = 'Disconnected';
    
    document.querySelectorAll('.w-device').forEach(dev => {
        dev.classList.remove('connected');
        dev.querySelector('.w-status').textContent = 'Inactive';
        dev.querySelector('.w-btn').innerHTML = '<i class="fas fa-link"></i> Link';
    });
    
    if (isExternalSource && currentConnectedWearable) {
        els.wearableConnText.className = 'connection-status online';
        els.wearableConnText.textContent = 'Active Ingress';
        
        const devCard = document.getElementById(`wd-${currentConnectedWearable}`);
        if (devCard) {
            devCard.classList.add('connected');
            devCard.querySelector('.w-status').textContent = 'Live Streaming';
            devCard.querySelector('.w-btn').innerHTML = '<i class="fas fa-unlink"></i> Unlink';
        }
    }
}

// ========== DYNAMIC TELEMETRY INGESTION LOOP ==========
function updateVitalsLoop() {
    if (!isExternalSource) {
        // Read physiological profiles
        const stateConfig = physiologicalStates[activeState];
        heartRate = stateConfig.hr();
        
        const bpStr = stateConfig.bp();
        const bpParts = bpStr.split('/');
        systolicBP = parseInt(bpParts[0]);
        diastolicBP = parseInt(bpParts[1]);
        
        bloodOxygen = stateConfig.spo2();
        temperature = stateConfig.temp();
        glucose = stateConfig.glucose();
        respRate = stateConfig.resp();
        
        els.patientStatusBadge.className = `status-badge ${stateConfig.badgeClass}`;
        els.patientStatusBadge.textContent = stateConfig.badgeText;
    }
    
    // Update local variables into sparkline arrays
    pushHistory('heartRate', heartRate);
    pushHistory('bloodPressure', systolicBP); // graph systolic BP
    pushHistory('bloodOxygen', bloodOxygen);
    pushHistory('temperature', temperature);
    pushHistory('glucose', glucose);
    pushHistory('respRate', respRate);
    
    // Redraw UI Numbers
    els.val_heartRate.textContent = heartRate;
    els.val_bloodPressure.textContent = `${systolicBP}/${diastolicBP}`;
    els.val_bloodOxygen.textContent = bloodOxygen;
    els.val_temperature.textContent = temperature;
    els.val_glucose.textContent = glucose;
    els.val_respRate.textContent = respRate;
    
    // Update overlay text
    els.pulseBpmText.textContent = heartRate;
    
    // Trigger canvas sparklines update
    drawSparklines();
    
    // Connect to AI prediction engine and Anomaly Detection APIs
    queryAIPredictions();
    queryAnomalyDetector();
}

// ========== NETWORK INGESTION DETECTOR (POLLING BACKEND) ==========
function pollExternalIngress() {
    fetch('/api/vitals_history')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success' && data.history.length > 0) {
                const latest = data.history[data.history.length - 1];
                
                // If the latest record came from the public webhook wearable bridge
                if (latest.source === 'wearable_bridge') {
                    const recordTime = new Date(latest.timestamp).getTime();
                    const now = new Date().getTime();
                    
                    // If data was pushed within the last 8 seconds, lock into external stream mode
                    if (now - recordTime < 8000) {
                        if (!isExternalSource || lastExternalTimestamp !== latest.timestamp) {
                            isExternalSource = true;
                            lastExternalTimestamp = latest.timestamp;
                            
                            // Map connected watch
                            currentConnectedWearable = 'garmin'; // Default maps to Garmin
                            
                            els.streamSourceBadge.innerHTML = `<i class="fas fa-satellite-dish"></i> Webhook: Garmin Venu`;
                            els.streamSourceBadge.style.color = '#00d4aa';
                            els.streamSourceBadge.style.borderColor = '#00d4aa';
                            
                            // Deactivate simulation buttons
                            els.simBtns.forEach(btn => btn.classList.remove('active'));
                            
                            // Sync vital variables
                            heartRate = latest.heartRate;
                            systolicBP = latest.systolicBP;
                            diastolicBP = latest.diastolicBP;
                            bloodOxygen = latest.bloodOxygen;
                            temperature = latest.temperature;
                            glucose = latest.glucose;
                            
                            // Estimate patient status based on vital levels
                            let statusText = 'External Live';
                            let statusClass = 'stable';
                            if (heartRate > 120 || bloodOxygen < 90 || systolicBP > 160) {
                                statusClass = 'critical';
                                statusText = 'Urgent Response';
                                activeState = 'Myocardial Infarction';
                            } else if (heartRate > 100 || systolicBP > 140) {
                                statusClass = 'warning';
                                statusText = 'Abnormal Vitals';
                                activeState = 'Stressed';
                            } else {
                                activeState = 'Healthy';
                            }
                            
                            els.patientStatusBadge.className = `status-badge ${statusClass}`;
                            els.patientStatusBadge.textContent = statusText;
                            
                            updateWearableStatusUI();
                            
                            // Visual flash to notify user
                            showNetworkIndicatorSyncState();
                        }
                    }
                }
            }
        })
        .catch(err => {
            console.error("Failed to sync client vitals history: ", err);
            els.netStatusIndicator.className = 'status-indicator';
            els.netStatusText.textContent = 'Cloud Disconnected';
        });
}

function showNetworkIndicatorSyncState() {
    els.netStatusIndicator.className = 'status-indicator syncing';
    els.netStatusText.textContent = 'Ingesting Wearable Packet...';
    setTimeout(() => {
        els.netStatusIndicator.className = 'status-indicator live';
        els.netStatusText.textContent = 'Live Synced';
    }, 1500);
}

// ========== AI PREDICTION ENGINE GATEWAY ==========
function queryAIPredictions() {
    const payload = {
        heartRate,
        systolicBP,
        diastolicBP,
        bloodOxygen,
        glucose,
        temperature,
        patientState: activeState
    };
    
    fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        // Update Risk dial UI
        riskPercentage = data.riskPercentage;
        clinicalRisk = data.clinicalRisk;
        lifestyleRisk = data.lifestyleRisk;
        
        els.riskPercentageText.textContent = Math.round(riskPercentage);
        els.clinicalRiskText.textContent = `${Math.round(clinicalRisk)}%`;
        els.lifestyleRiskText.textContent = `${Math.round(lifestyleRisk)}%`;
        
        // Update Risk Tag and color
        els.riskLevelTag.textContent = `${data.riskLevel} RISK`;
        els.riskLevelTag.className = `neon-tag ${data.riskLevel.toLowerCase() === 'high' ? 'red' : data.riskLevel.toLowerCase() === 'moderate' ? 'orange' : 'green'}`;
        
        // Update circular ring offset
        updateRiskRing(riskPercentage);
        
        // Render recommendations list
        els.recommendationsList.innerHTML = '';
        data.recommendations.forEach(rec => {
            const li = document.createElement('li');
            li.textContent = rec;
            els.recommendationsList.appendChild(li);
        });
    })
    .catch(err => console.error("Risk assessment prediction error: ", err));
}

// Update the SVG circular dial offset
function updateRiskRing(percentage) {
    const radius = els.riskRing.r.baseVal.value;
    const circumference = 2 * Math.PI * radius; // 2 * 3.14 * 68 = 427.2
    const offset = circumference - (percentage / 100) * circumference;
    els.riskRing.style.strokeDashoffset = offset;
    
    // Dynamically change ring color
    if (percentage >= 70) {
        els.riskRing.style.stroke = 'var(--neon-red)';
    } else if (percentage >= 35) {
        els.riskRing.style.stroke = 'var(--neon-orange)';
    } else {
        els.riskRing.style.stroke = 'var(--neon-teal)';
    }
}

// ========== ANOMALY DETECTION AND DESKTOP PUSH ALERTS ==========
function queryAnomalyDetector() {
    const payload = {
        heartRate,
        systolicBP,
        diastolicBP,
        bloodOxygen,
        temperature
    };
    
    fetch('/api/detect_anomaly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        // Redraw vital card boundaries based on parameter alerts
        resetVitalCardDangerBorders();
        
        const activeAlertParams = new Set();
        data.alerts.forEach(alert => {
            activeAlertParams.add(alert.param);
            
            // Apply danger border styling to specific vital card
            const vitalCard = document.getElementById(`card-${alert.param}`);
            if (vitalCard) {
                vitalCard.classList.add(alert.type === 'danger' ? 'danger-vital' : 'warning-vital');
            }
            
            // Add anomaly item to Feed Log
            const alertKey = `${alert.title}-${alert.param}`;
            if (!triggeredAlerts.has(alertKey)) {
                triggeredAlerts.add(alertKey);
                addAnomalyToLog(alert);
                triggerDesktopPushAlert(alert);
            }
        });
        
        // Update total alert badge counter
        updateAlertCountBadge();
    })
    .catch(err => console.error("Anomaly checking error: ", err));
}

function resetVitalCardDangerBorders() {
    const vitalParams = ['heartRate', 'bloodPressure', 'bloodOxygen', 'temperature', 'glucose', 'respRate'];
    vitalParams.forEach(param => {
        const card = document.getElementById(`card-${param}`);
        if (card) {
            card.classList.remove('danger-vital', 'warning-vital');
        }
    });
}

function addAnomalyToLog(alert) {
    els.feedEmptyState.style.display = 'none';
    
    const item = document.createElement('div');
    item.className = `anomaly-item ${alert.type}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    item.innerHTML = `
        <div class="anomaly-title-wrapper">
            <span class="anomaly-title"><i class="fas fa-triangle-exclamation"></i> ${alert.title}</span>
            <span class="anomaly-time">${time}</span>
        </div>
        <div class="anomaly-desc">${alert.message}</div>
    `;
    
    els.anomalyFeed.insertBefore(item, els.anomalyFeed.firstChild);
}

function triggerDesktopPushAlert(alert) {
    if (alert.type === 'danger' && Notification.permission === 'granted') {
        const notification = new Notification(`⚠️ CRITICAL: ${alert.title}`, {
            body: alert.message,
            icon: 'https://cdn-icons-png.flaticon.com/512/2069/2069571.png',
            tag: alert.param
        });
        
        // Pulse system sound if available
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        } catch(e) {
            // browser context blocks audio until interact, ignore
        }
    }
}

function updateAlertCountBadge() {
    const activeAlertItems = els.anomalyFeed.querySelectorAll('.anomaly-item.danger').length;
    els.alertBadge.textContent = activeAlertItems;
    els.alertBadge.style.display = activeAlertItems > 0 ? 'flex' : 'none';
}

// Clear Anomaly log triggers
document.getElementById('clearLogBtn').addEventListener('click', () => {
    els.anomalyFeed.innerHTML = '';
    els.feedEmptyState.style.display = 'block';
    triggeredAlerts.clear();
    updateAlertCountBadge();
});

// ========== MEDICATION SCHEDULE MARK COMPLETED ==========
function renderMedications(meds) {
    els.medTableBody.innerHTML = '';
    meds.forEach(med => {
        const tr = document.createElement('tr');
        const icon = med.type === 'injection' ? 'fa-syringe' : med.type === 'capsule' ? 'fa-capsules' : 'fa-pills';
        
        tr.innerHTML = `
            <td>
                <div class="med-name-col">
                    <div class="med-icon-box">
                        <i class="fas ${icon}"></i>
                    </div>
                    <span>${med.name}</span>
                </div>
            </td>
            <td>${med.dosage}</td>
            <td><span class="time-badge">${med.time}</span></td>
            <td>
                <span class="status-text ${med.status}" id="med-status-${med.id}">
                    ${med.status === 'taken' ? '<i class="fas fa-check-circle"></i> Administered' : '<i class="far fa-circle"></i> Pending'}
                </span>
            </td>
            <td>
                ${med.status === 'pending' ? `
                    <button class="action-btn-sm" onclick="markMedTaken(${med.id})">Administer</button>
                    <button class="action-btn-sm snooze" onclick="snoozeMed(${med.id})" style="margin-left: 5px;">Snooze</button>
                ` : `<span class="time-badge">${med.takenAt}</span>`}
            </td>
        `;
        els.medTableBody.appendChild(tr);
    });
}

window.markMedTaken = function(id) {
    const med = defaultMedications.find(m => m.id === id);
    if (med) {
        med.status = 'taken';
        const now = new Date();
        med.takenAt = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        renderMedications(defaultMedications);
        
        // Add point to AI health score
        riskPercentage = Math.max(0, riskPercentage - 3);
        updateRiskRing(riskPercentage);
    }
};

window.snoozeMed = function(id) {
    const med = defaultMedications.find(m => m.id === id);
    if (med) {
        alert(`${med.name} administration schedule delayed by 30 minutes.`);
    }
};

// ========== SPARKLINE GENERATOR (CANVAS) ==========
function setupSparklines() {
    const sparkParams = ['heartRate', 'bloodPressure', 'bloodOxygen', 'temperature', 'glucose', 'respRate'];
    sparkParams.forEach(param => {
        const canv = document.getElementById(`spark-${param}`);
        if (canv) {
            sparklines[param] = canv.getContext('2d');
            // Set exact coordinates sizing
            canv.width = canv.offsetWidth * window.devicePixelRatio;
            canv.height = 40 * window.devicePixelRatio;
            sparklines[param].scale(window.devicePixelRatio, window.devicePixelRatio);
        }
    });
}

function drawSparklines() {
    const sparkParams = ['heartRate', 'bloodPressure', 'bloodOxygen', 'temperature', 'glucose', 'respRate'];
    sparkParams.forEach(param => {
        const ctx = sparklines[param];
        if (!ctx) return;
        
        const canvas = ctx.canvas;
        const width = canvas.width / window.devicePixelRatio;
        const height = 40;
        
        ctx.clearRect(0, 0, width, height);
        
        const history = vitalHistory[param];
        if (history.length < 2) return;
        
        // Find min/max for scale
        let min = Math.min(...history);
        let max = Math.max(...history);
        if (max === min) {
            max += 1.0;
            min -= 1.0;
        }
        const range = max - min;
        
        // Set colors based on active alert status
        let strokeColor = 'rgba(0, 212, 170, 0.7)'; // normal teal
        if (param === 'heartRate' && (heartRate > 100 || heartRate < 50)) {
            strokeColor = heartRate > 120 ? 'rgba(255, 56, 56, 0.8)' : 'rgba(255, 168, 0, 0.8)';
        } else if (param === 'bloodOxygen' && bloodOxygen < 95) {
            strokeColor = 'rgba(255, 56, 56, 0.8)';
        } else if (param === 'bloodPressure' && systolicBP > 140) {
            strokeColor = 'rgba(255, 168, 0, 0.8)';
        }
        
        ctx.beginPath();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        
        const step = width / (history.length - 1);
        for (let i = 0; i < history.length; i++) {
            const x = i * step;
            const normY = (history[i] - min) / range;
            const y = height - 4 - (normY * (height - 8)); // invert Y and pad margins
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // draw filled gradient underneath sparkline
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, strokeColor.replace('0.7', '0.08').replace('0.8', '0.1'));
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();
    });
}

function pushHistory(param, value) {
    const history = vitalHistory[param];
    history.push(value);
    if (history.length > 20) {
        history.shift();
    }
}

// ========== CANVA REAL-TIME ECG MONITOR (Green Sine-Wave) ==========
let ecgCanvas, ecgCtx;
let ecgIndex = 0;
let ecgPoints = [];
const ecgSpeed = 2.8;

function setupEcgMonitor() {
    ecgCanvas = document.getElementById('ecgCanvas');
    ecgCtx = ecgCanvas.getContext('2d');
    
    // Sizing
    resizeEcgCanvas();
    window.addEventListener('resize', resizeEcgCanvas);
    
    // Draw loop
    requestAnimationFrame(drawEcgFrame);
}

function resizeEcgCanvas() {
    if (ecgCanvas) {
        ecgCanvas.width = ecgCanvas.offsetWidth * window.devicePixelRatio;
        ecgCanvas.height = ecgCanvas.offsetHeight * window.devicePixelRatio;
        ecgCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
}

// Generate P-Q-R-S-T wave mathematically based on current state and phase
function getEcgYValue(phase, state) {
    // Normal resting rhythm structure
    if (state === 'Healthy' || state === 'Exercising' || state === 'Stressed') {
        // P Wave
        if (phase >= 0.1 && phase < 0.18) {
            return Math.sin(((phase - 0.1) / 0.08) * Math.PI) * 12;
        }
        // Q Wave
        if (phase >= 0.2 && phase < 0.22) {
            return -((phase - 0.2) / 0.02) * 8;
        }
        // R Wave (Tall Spike)
        if (phase >= 0.22 && phase < 0.25) {
            const mid = 0.235;
            if (phase < mid) {
                return -8 + ((phase - 0.22) / (mid - 0.22)) * 95;
            } else {
                return 87 - ((phase - mid) / (0.25 - mid)) * 105;
            }
        }
        // S Wave
        if (phase >= 0.25 && phase < 0.28) {
            return -18 + ((phase - 0.25) / 0.03) * 18;
        }
        // T Wave
        if (phase >= 0.38 && phase < 0.48) {
            return Math.sin(((phase - 0.38) / 0.1) * Math.PI) * 20;
        }
        return 0; // Baseline
    }
    
    // Arrhythmia (chaotic spikes, irregular spacing)
    if (state === 'Arrhythmia') {
        if (phase >= 0.1 && phase < 0.18) {
            return Math.sin(((phase - 0.1) / 0.08) * Math.PI) * 8;
        }
        if (phase >= 0.18 && phase < 0.24) {
            // Premature R spike
            const height = Math.random() > 0.5 ? 90 : 50;
            return Math.sin(((phase - 0.18) / 0.06) * Math.PI) * height;
        }
        if (phase >= 0.4 && phase < 0.5) {
            return Math.sin(((phase - 0.4) / 0.1) * Math.PI) * 10;
        }
        return Math.sin(phase * Math.PI * 4) * 3; // tiny baseline noise
    }
    
    // Myocardial Infarction (ST elevation - S doesn't return to base, T is fused)
    if (state === 'Myocardial Infarction') {
        // P Wave
        if (phase >= 0.1 && phase < 0.18) {
            return Math.sin(((phase - 0.1) / 0.08) * Math.PI) * 12;
        }
        // Q Wave
        if (phase >= 0.2 && phase < 0.22) {
            return -((phase - 0.2) / 0.02) * 10;
        }
        // R Wave
        if (phase >= 0.22 && phase < 0.25) {
            const mid = 0.235;
            return phase < mid ? -10 + ((phase - 0.22) / 0.015) * 85 : 75 - ((phase - mid) / 0.015) * 55;
        }
        // Elevated ST Segment (instead of returning to 0, it stays at 20px height)
        if (phase >= 0.25 && phase < 0.48) {
            const localP = (phase - 0.25) / 0.23;
            // Fused high ST segment and wide T wave
            return 20 + Math.sin(localP * Math.PI) * 25;
        }
        return 0;
    }
    
    return 0;
}

let phase = 0;
function drawEcgFrame() {
    if (!ecgCtx) return;
    
    const width = ecgCanvas.width / window.devicePixelRatio;
    const height = ecgCanvas.height / window.devicePixelRatio;
    const centerY = height / 2;
    
    // Driven by active heartRate. Higher HR = faster phase cycle
    const cycleDuration = 60 / heartRate; // seconds per beat
    const phaseIncrement = (1 / 60) / cycleDuration; // 60 FPS update
    phase += phaseIncrement;
    if (phase >= 1.0) {
        phase = 0;
        // Arrhythmia introduces slight phase cycle jitter
        if (activeState === 'Arrhythmia') {
            phase = Math.random() * 0.15;
        }
    }
    
    // Add new point
    const yVal = getEcgYValue(phase, activeState);
    // Add vertical inversion to draw correctly on canvas
    ecgPoints.push(centerY - yVal);
    
    if (ecgPoints.length > width / ecgSpeed) {
        ecgPoints.shift();
    }
    
    ecgCtx.clearRect(0, 0, width, height);
    
    // Set line glow colors based on patient state
    let strokeColor = '#00d4aa'; // normal green
    let shadowColor = 'rgba(0, 212, 170, 0.4)';
    let statusText = 'Normal Sinus Rhythm';
    
    if (activeState === 'Exercising') {
        statusText = 'Sinus Tachycardia (Physiological)';
    } else if (activeState === 'Stressed') {
        strokeColor = '#ffa800';
        shadowColor = 'rgba(255, 168, 0, 0.4)';
        statusText = 'Elevated Sinus Tachycardia';
    } else if (activeState === 'Arrhythmia') {
        strokeColor = '#ffa800';
        shadowColor = 'rgba(255, 168, 0, 0.4)';
        statusText = 'Atrial Fibrillation (Irregular)';
    } else if (activeState === 'Myocardial Infarction') {
        strokeColor = '#ff3838';
        shadowColor = 'rgba(255, 56, 56, 0.5)';
        statusText = 'CRITICAL: Acute ST-Elevation (STEMI)';
    }
    
    // Update monitor label
    document.getElementById('ecgLabel').textContent = statusText;
    document.getElementById('ecgLabel').className = `ecg-status-text ${activeState === 'Myocardial Infarction' ? 'critical' : activeState === 'Arrhythmia' || activeState === 'Stressed' ? 'warning' : ''}`;
    
    ecgCtx.beginPath();
    ecgCtx.strokeStyle = strokeColor;
    ecgCtx.lineWidth = 2.2;
    ecgCtx.lineJoin = 'round';
    
    // Shadow glow effect
    ecgCtx.shadowBlur = 8;
    ecgCtx.shadowColor = strokeColor;
    
    for (let i = 0; i < ecgPoints.length; i++) {
        const x = i * ecgSpeed;
        const y = ecgPoints[i];
        if (i === 0) ecgCtx.moveTo(x, y);
        else ecgCtx.lineTo(x, y);
    }
    ecgCtx.stroke();
    
    // Remove shadow before ending frame to avoid leaking into other operations
    ecgCtx.shadowBlur = 0;
    
    requestAnimationFrame(drawEcgFrame);
}

// ========== THREE.JS 3D ANATOMICAL HEART VIEWPORT ==========
let scene, camera, renderer, heartMesh;

function setupThreeJSHeart() {
    const container = document.getElementById('three-container');
    if (!container) return;
    
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    
    scene = new THREE.Scene();
    
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.z = 12;
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    // 1. Programmatic Anatomical Heart Geometry
    const geom = new THREE.SphereGeometry(3.0, 64, 64);
    const pos = geom.attributes.position;
    const v = new THREE.Vector3();
    
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        
        // Shape deformation: taper bottom apex
        if (v.y < 0) {
            v.x += Math.pow(Math.abs(v.y), 1.5) * 0.32; // Lean tilt
            v.z *= (1.0 + v.y * 0.38); // Taper bottom
        }
        
        // Ventricular atrial structures
        if (v.y > 0.4) {
            v.x *= (1.0 + (v.y - 0.4) * 0.3);
            v.z *= (1.0 + (v.y - 0.4) * 0.6);
        }
        
        // Muscular fiber noise
        const noise = Math.sin(v.y * 9) * Math.cos(v.x * 9) * 0.06;
        v.addScaledVector(v, noise);
        
        // Write back scaling coordinates
        pos.setXYZ(i, v.x * 0.72, v.y * 0.98, v.z * 0.72);
    }
    geom.computeVertexNormals();
    
    // 2. Translucent organic material
    const heartMat = new THREE.MeshStandardMaterial({
        color: 0xc00404,
        roughness: 0.28,
        metalness: 0.15,
        emissive: 0x1f0000,
        flatShading: false
    });
    
    heartMesh = new THREE.Mesh(geom, heartMat);
    // Rotate to align anatomically
    heartMesh.rotation.z = -0.15;
    heartMesh.rotation.y = 0.3;
    scene.add(heartMesh);
    
    // 3. Lighting
    const topLight = new THREE.DirectionalLight(0xffffff, 2.0);
    topLight.position.set(0, 8, 4);
    scene.add(topLight);
    
    const sideLight = new THREE.DirectionalLight(0x00d4aa, 0.6); // Cyan ambient reflection
    sideLight.position.set(-6, 2, 2);
    scene.add(sideLight);
    
    const bottomGlow = new THREE.PointLight(0xff0000, 1.0, 15);
    bottomGlow.position.set(0, -3, 2);
    scene.add(bottomGlow);
    
    // Resize handler
    window.addEventListener('resize', () => {
        const w = container.offsetWidth;
        const h = container.offsetHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
    
    // Start animation loop
    animateThreeHeart();
}

function animateThreeHeart() {
    requestAnimationFrame(animateThreeHeart);
    
    if (heartMesh) {
        const t = performance.now() * 0.001;
        
        // Synchronized pulse calculation
        const cycleDuration = 60 / heartRate;
        const local = t % cycleDuration;
        
        // Lubb-Dupp double beat
        const lubb = Math.exp(-Math.pow((local - 0.08) / 0.05, 2)) * 0.15;
        const dupp = Math.exp(-Math.pow((local - 0.24) / 0.04, 2)) * 0.06;
        const pulse = lubb + dupp;
        
        const baseScale = 1.0;
        const scale = baseScale - pulse; // Squeezes during contraction
        
        heartMesh.scale.set(scale, scale * 1.02, scale);
        
        // Emissive interior glow intensifies during contraction
        heartMesh.material.emissiveIntensity = pulse * 12;
        heartMesh.material.color.setHex(activeState === 'Myocardial Infarction' ? 0xff0000 : 0xaa0000);
        
        // Slowly rotate heart
        heartMesh.rotation.y = 0.3 + Math.sin(t * 0.2) * 0.15;
    }
    
    renderer.render(scene, camera);
}

// ========== INTEGRATION GUIDE MODAL CONTROLS ==========
function setupWearableGuideModal() {
    // Open Guide
    els.openGuideBtn.addEventListener('click', () => {
        els.guideModal.classList.add('active');
    });
    
    // Close Guide
    const closeBtns = [els.closeGuideBtn, els.closeGuideBtn2];
    closeBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                els.guideModal.classList.remove('active');
            });
        }
    });
    
    // Click outside modal to close
    els.guideModal.addEventListener('click', (e) => {
        if (e.target === els.guideModal) {
            els.guideModal.classList.remove('active');
        }
    });
    
    // Tab buttons switching
    els.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            els.tabBtns.forEach(b => b.classList.remove('active'));
            els.tabPanes.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = `tab-${btn.getAttribute('data-tab')}`;
            const targetPane = document.getElementById(tabId);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });
}

// Global modal linkage helper for sidebar buttons
window.openIntegrationGuide = function(provider) {
    els.guideModal.classList.add('active');
    
    // Automatically switch to corresponding tab if matched
    let tabTarget = 'curl';
    if (provider === 'apple') tabTarget = 'apple';
    else if (provider === 'fitbit') tabTarget = 'fitbit';
    else if (provider === 'garmin') tabTarget = 'terra';
    
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabTarget}"]`);
    if (targetBtn) {
        targetBtn.click();
    }
};

// ========== HELPER UTILITIES ==========
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function roundTo(num, places) {
    const factor = Math.pow(10, places);
    return Math.round(num * factor) / factor;
}

// ========== RUN PLATFORM ==========
document.addEventListener('DOMContentLoaded', init);
