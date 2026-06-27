import numpy as np

class AnomalyDetector:
    """
    A clinical rules-based anomaly detection engine for real-time vital streams.
    Flags abnormal heart rate, blood pressure, oxygen levels, and temperature.
    """
    
    def __init__(self):
        pass
        
    def detect_anomalies(self, vitals):
        """
        Analyze current vitals and return alerts and severity
        vitals: dict containing:
          - heartRate (int)
          - systolicBP (int)
          - diastolicBP (int)
          - bloodOxygen (int)
          - temperature (float)
        """
        alerts = []
        severity = 0.0 # 0.0 to 1.0
        
        hr = vitals.get('heartRate', 72)
        sys_bp = vitals.get('systolicBP', 120)
        dia_bp = vitals.get('diastolicBP', 80)
        spo2 = vitals.get('bloodOxygen', 98)
        temp = vitals.get('temperature', 36.8)
        
        # 1. Heart Rate Checks
        if hr > 120:
            alerts.append({
                'type': 'danger',
                'param': 'heartRate',
                'title': 'Severe Tachycardia',
                'message': f"Heart rate is dangerously high ({hr} BPM). Immediate rest advised."
            })
            severity = max(severity, 0.8)
        elif hr > 100:
            alerts.append({
                'type': 'warning',
                'param': 'heartRate',
                'title': 'Tachycardia',
                'message': f"Heart rate is elevated ({hr} BPM) at rest."
            })
            severity = max(severity, 0.4)
        elif hr < 45:
            alerts.append({
                'type': 'danger',
                'param': 'heartRate',
                'title': 'Severe Bradycardia',
                'message': f"Heart rate is dangerously low ({hr} BPM)."
            })
            severity = max(severity, 0.7)
        elif hr < 60:
            alerts.append({
                'type': 'warning',
                'param': 'heartRate',
                'title': 'Mild Bradycardia',
                'message': f"Heart rate is low ({hr} BPM)."
            })
            severity = max(severity, 0.3)
            
        # 2. Blood Oxygen Checks
        if spo2 < 88:
            alerts.append({
                'type': 'danger',
                'param': 'bloodOxygen',
                'title': 'Critical Hypoxia',
                'message': f"Blood oxygen levels are critically low ({spo2}%). Seek emergency care."
            })
            severity = max(severity, 0.95)
        elif spo2 < 93:
            alerts.append({
                'type': 'danger',
                'param': 'bloodOxygen',
                'title': 'Hypoxia Warning',
                'message': f"Oxygen saturation is below healthy limits ({spo2}%)."
            })
            severity = max(severity, 0.7)
        elif spo2 < 95:
            alerts.append({
                'type': 'warning',
                'param': 'bloodOxygen',
                'title': 'Borderline Low Oxygen',
                'message': f"Oxygen saturation is slightly low ({spo2}%)."
            })
            severity = max(severity, 0.3)
            
        # 3. Blood Pressure Checks
        if sys_bp >= 180 or dia_bp >= 120:
            alerts.append({
                'type': 'danger',
                'param': 'bloodPressure',
                'title': 'Hypertensive Crisis',
                'message': f"Blood pressure is extremely high ({sys_bp}/{dia_bp} mmHg). Seek medical help immediately."
            })
            severity = max(severity, 0.9)
        elif sys_bp >= 160 or dia_bp >= 100:
            alerts.append({
                'type': 'danger',
                'param': 'bloodPressure',
                'title': 'Stage 2 Hypertension',
                'message': f"Blood pressure is significantly elevated ({sys_bp}/{dia_bp} mmHg)."
            })
            severity = max(severity, 0.6)
        elif sys_bp >= 140 or dia_bp >= 90:
            alerts.append({
                'type': 'warning',
                'param': 'bloodPressure',
                'title': 'Stage 1 Hypertension',
                'message': f"Blood pressure is high ({sys_bp}/{dia_bp} mmHg)."
            })
            severity = max(severity, 0.3)
        elif sys_bp < 90 or dia_bp < 60:
            alerts.append({
                'type': 'warning',
                'param': 'bloodPressure',
                'title': 'Hypotension',
                'message': f"Blood pressure is low ({sys_bp}/{dia_bp} mmHg)."
            })
            severity = max(severity, 0.3)
            
        # 4. Temperature Checks
        if temp >= 39.0:
            alerts.append({
                'type': 'danger',
                'param': 'temperature',
                'title': 'Severe Hyperthermia (Fever)',
                'message': f"Body temperature is high ({temp}°C)."
            })
            severity = max(severity, 0.5)
        elif temp >= 38.0:
            alerts.append({
                'type': 'warning',
                'param': 'temperature',
                'title': 'Mild Fever',
                'message': f"Body temperature is elevated ({temp}°C)."
            })
            severity = max(severity, 0.2)
        elif temp <= 35.0:
            alerts.append({
                'type': 'danger',
                'param': 'temperature',
                'title': 'Hypothermia Warning',
                'message': f"Body temperature is low ({temp}°C)."
            })
            severity = max(severity, 0.6)
            
        # Overall anomaly status
        status = 'healthy'
        if severity >= 0.7:
            status = 'critical'
        elif severity >= 0.3:
            status = 'abnormal'
            
        return {
            'status': status,
            'severity': severity,
            'alerts': alerts
        }
