from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import joblib
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random

from anomaly_detector import AnomalyDetector

app = Flask(__name__, static_folder='static')
CORS(app)

# Cache folders
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'trained_models')

# Load machine learning models and scalers
models = {}
scalers = {}
features = {}

def load_ml_models():
    global models, scalers, features
    try:
        models['clinical'] = joblib.load(os.path.join(MODELS_DIR, 'clinical_model.pkl'))
        scalers['clinical'] = joblib.load(os.path.join(MODELS_DIR, 'clinical_scaler.pkl'))
        features['clinical'] = joblib.load(os.path.join(MODELS_DIR, 'clinical_features.pkl'))
        print("Clinical ML Model loaded successfully.")
    except Exception as e:
        print(f"Warning: Could not load Clinical model: {e}")
        models['clinical'] = None

    try:
        models['lifestyle'] = joblib.load(os.path.join(MODELS_DIR, 'lifestyle_model.pkl'))
        scalers['lifestyle'] = joblib.load(os.path.join(MODELS_DIR, 'lifestyle_scaler.pkl'))
        features['lifestyle'] = joblib.load(os.path.join(MODELS_DIR, 'lifestyle_features.pkl'))
        print("Lifestyle ML Model loaded successfully.")
    except Exception as e:
        print(f"Warning: Could not load Lifestyle model: {e}")
        models['lifestyle'] = None

load_ml_models()
anomaly_engine = AnomalyDetector()

# In-memory history cache for dashboard sparklines and trends
vitals_history = []
max_history_len = 50

# Seed initial history for Mr. Tushar Yadav
def seed_initial_history():
    global vitals_history
    base_time = datetime.now() - timedelta(minutes=60)
    for i in range(30):
        timestamp = base_time + timedelta(minutes=2 * i)
        # Generate slightly fluctuating normal vitals
        vitals_history.append({
            'timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'heartRate': random.randint(68, 76),
            'systolicBP': random.randint(115, 122),
            'diastolicBP': random.randint(75, 80),
            'bloodOxygen': random.randint(97, 99),
            'glucose': random.randint(90, 110),
            'temperature': round(random.uniform(36.5, 36.9), 1),
            'source': 'simulated'
        })

seed_initial_history()

# Patient baseline profile information
PATIENT_PROFILE = {
    'id': 'P-8345-2023',
    'name': 'Mr. TUSHAR YADAV',
    'age': 22,
    'sex': 1, # Male
    'bloodType': 'O+',
    'height': 165,
    'weight': 52,
    'bmi': 19.1,
    'diabetes': 1, # Type 2 Diabetes
    'hypertension': 1, # Hypertension
    'medications': [
        {"id": 1, "name": "Metformin", "dosage": "500mg", "time": "08:00 AM", "type": "tablet", "status": "taken", "takenAt": "08:05 AM"},
        {"id": 2, "name": "Lisinopril", "dosage": "10mg", "time": "09:00 AM", "type": "tablet", "status": "pending"},
        {"id": 3, "name": "Atorvastatin", "dosage": "20mg", "time": "08:00 PM", "type": "tablet", "status": "pending"},
        {"id": 4, "name": "Aspirin", "dosage": "81mg", "time": "07:00 AM", "type": "tablet", "status": "taken", "takenAt": "07:10 AM"}
    ],
    'careTeam': {
        'physician': 'Dr. Alex Morgan',
        'endocrinologist': 'Dr. Sarah Johnson',
        'emergencyContact': 'Lisa Chen (Wife) - (+91) 123-123-4567'
    }
}

# Serve the static Frontend files
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/patient_profile', methods=['GET'])
def get_patient_profile():
    return jsonify(PATIENT_PROFILE)

@app.route('/api/vitals_history', methods=['GET'])
def get_vitals_history():
    # Return formatted history for graphs
    return jsonify({
        'status': 'success',
        'count': len(vitals_history),
        'history': vitals_history
    })

# public webhook endpoint for external wearable telemetry
@app.route('/api/wearable/ingest', methods=['POST'])
def ingest_wearable_data():
    global vitals_history
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'status': 'error', 'message': 'Empty JSON payload'}), 400
            
        # Standardize vital variables
        # Accepts standard parameters directly or inside a nested 'vitals' key
        vitals_payload = data.get('vitals', data)
        
        heart_rate = int(vitals_payload.get('heartRate', vitals_payload.get('heart_rate', 72)))
        systolic = int(vitals_payload.get('systolicBP', vitals_payload.get('systolic_bp', 120)))
        diastolic = int(vitals_payload.get('diastolicBP', vitals_payload.get('diastolic_bp', 80)))
        spo2 = int(vitals_payload.get('bloodOxygen', vitals_payload.get('blood_oxygen', 98)))
        glucose = int(vitals_payload.get('glucose', 100))
        temp = float(vitals_payload.get('temperature', 36.7))
        
        new_record = {
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'heartRate': heart_rate,
            'systolicBP': systolic,
            'diastolicBP': diastolic,
            'bloodOxygen': spo2,
            'glucose': glucose,
            'temperature': temp,
            'source': 'wearable_bridge'
        }
        
        vitals_history.append(new_record)
        if len(vitals_history) > max_history_len:
            vitals_history.pop(0)
            
        # Detect anomaly instantly on the stream
        analysis = anomaly_engine.detect_anomalies(new_record)
        
        return jsonify({
            'status': 'success',
            'message': 'Data ingested successfully',
            'vitals': new_record,
            'analysis': analysis
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/detect_anomaly', methods=['POST'])
def detect_anomaly():
    data = request.json
    if not data:
        return jsonify({'status': 'error', 'message': 'No data provided'}), 400
    analysis = anomaly_engine.detect_anomalies(data)
    return jsonify(analysis)

@app.route('/api/predict', methods=['POST'])
def predict_cardiac_risk():
    """
    Combines Clinical Model A and Lifestyle Model B to yield 
    a highly precise patient-specific risk assessment.
    """
    data = request.json
    if not data:
        return jsonify({'status': 'error', 'message': 'No vitals data provided'}), 400

    # Extract incoming vitals
    hr = int(data.get('heartRate', 72))
    sys_bp = int(data.get('systolicBP', 120))
    dia_bp = int(data.get('diastolicBP', 80))
    spo2 = int(data.get('bloodOxygen', 98))
    glucose = int(data.get('glucose', 100))
    temp = float(data.get('temperature', 36.8))
    patient_state = data.get('patientState', 'Healthy')

    # Heuristic default predictions if ML loading failed
    clinical_risk = 0.15
    lifestyle_risk = 0.20

    # 1. Evaluate Clinical Model (Model A)
    if models['clinical'] and scalers['clinical'] and features['clinical']:
        try:
            # Map input to Model A features:
            # ['age', 'sex', 'cp', 'trestbps', 'chol', 'fbs', 'restecg', 'thalach', 'exang', 'oldpeak', 'slope', 'ca', 'thal']
            cp = 0 # Normal
            exang = 0
            oldpeak = 0.0
            slope = 2 # Up-sloping
            restecg = 0
            
            # Map values based on patientState simulation
            if patient_state == 'Exercising':
                thalach_val = hr
                oldpeak = 0.5
                exang = 0
            elif patient_state == 'Stressed':
                thalach_val = hr
                oldpeak = 1.0
                cp = 1 # atypical angina
            elif patient_state == 'Arrhythmia':
                thalach_val = hr
                restecg = 1 # abnormal
                cp = 2
            elif patient_state == 'Myocardial Infarction':
                thalach_val = hr
                cp = 3 # asymptomatic/typical angina chest pain
                exang = 1
                oldpeak = 3.0 # ST depression
                slope = 0 # flat/down-sloping
                restecg = 2 # hyper-acute T waves/ST elevation
            else:
                thalach_val = hr
                
            fbs = 1 if glucose > 120 else 0
            
            clinical_input = {
                'age': PATIENT_PROFILE['age'],
                'sex': PATIENT_PROFILE['sex'],
                'cp': cp,
                'trestbps': sys_bp,
                'chol': 195, # Baseline
                'fbs': fbs,
                'restecg': restecg,
                'thalach': thalach_val,
                'exang': exang,
                'oldpeak': oldpeak,
                'slope': slope,
                'ca': 0,
                'thal': 2 # Normal
            }
            
            # Ensure correct columns order
            input_df = pd.DataFrame([clinical_input])
            input_df = input_df[features['clinical']]
            
            # Scale and Predict
            scaled_input = scalers['clinical'].transform(input_df)
            prob = models['clinical'].predict_proba(scaled_input)[0][1]
            clinical_risk = float(prob)
        except Exception as e:
            print(f"Error executing Clinical Model inference: {e}")

    # 2. Evaluate Lifestyle Model (Model B)
    if models['lifestyle'] and scalers['lifestyle'] and features['lifestyle']:
        try:
            # Map input to Model B features:
            # ['Age', 'Sex', 'Cholesterol', 'Heart Rate', 'Diabetes', 'Family History', 'Smoking', 'Obesity', 'Alcohol Consumption', 'Exercise Hours Per Week', 'Diet', 'Previous Heart Problems', 'Medication Use', 'Stress Level', 'Sedentary Hours Per Day', 'Income', 'BMI', 'Triglycerides', 'Physical Activity Days Per Week', 'Sleep Hours Per Day', 'Systolic_BP', 'Diastolic_BP']
            stress_level = 3
            if patient_state == 'Stressed':
                stress_level = 8
            elif patient_state == 'Myocardial Infarction':
                stress_level = 10
            elif patient_state == 'Exercising':
                stress_level = 5
                
            lifestyle_input = {
                'Age': PATIENT_PROFILE['age'],
                'Sex': PATIENT_PROFILE['sex'],
                'Cholesterol': 195,
                'Heart Rate': hr,
                'Diabetes': PATIENT_PROFILE['diabetes'],
                'Family History': 0,
                'Smoking': 0,
                'Obesity': 0,
                'Alcohol Consumption': 0,
                'Exercise Hours Per Week': 4,
                'Diet': 2, # Healthy
                'Previous Heart Problems': 0,
                'Medication Use': 1,
                'Stress Level': stress_level,
                'Sedentary Hours Per Day': 5,
                'Income': 50000,
                'BMI': PATIENT_PROFILE['bmi'],
                'Triglycerides': 150,
                'Physical Activity Days Per Week': 3,
                'Sleep Hours Per Day': 7,
                'Systolic_BP': sys_bp,
                'Diastolic_BP': dia_bp
            }
            
            input_df = pd.DataFrame([lifestyle_input])
            input_df = input_df[features['lifestyle']]
            
            scaled_input = scalers['lifestyle'].transform(input_df)
            prob = models['lifestyle'].predict_proba(scaled_input)[0][1]
            lifestyle_risk = float(prob)
        except Exception as e:
            print(f"Error executing Lifestyle Model inference: {e}")

    # Combine models: Weighted average (70% Clinical Model, 30% Lifestyle Model)
    # The clinical model holds standard physiological parameters, which are stronger risk drivers.
    combined_risk = (0.7 * clinical_risk) + (0.3 * lifestyle_risk)
    
    # Bound and adjust based on critical flags
    if patient_state == 'Myocardial Infarction':
        combined_risk = max(0.92, combined_risk)
    elif spo2 < 90:
        combined_risk = max(0.75, combined_risk)
        
    risk_percentage = round(combined_risk * 100, 1)
    
    risk_level = "LOW"
    if risk_percentage >= 70:
        risk_level = "HIGH"
    elif risk_percentage >= 35:
        risk_level = "MODERATE"
        
    # Generate insights/recommendations based on active parameters
    recommendations = []
    if risk_level == "HIGH":
        recommendations.append("🚨 Emergency cardiac risk detected. Immediate clinical assessment or cardiologist consultation is required.")
    
    if sys_bp > 140 or dia_bp > 90:
        recommendations.append("📉 Blood pressure is elevated. Rest, minimize sodium, and log readings twice daily.")
    if spo2 < 95:
        recommendations.append("🫁 Lower oxygen saturation detected. If experiencing shortness of breath, administer emergency oxygen or seek care.")
    if hr > 100 and patient_state != 'Exercising':
        recommendations.append("💓 Resting tachycardia observed. Focus on deep breathing and avoid caffeine/stimulants.")
    if glucose > 140:
        recommendations.append("🍬 Elevated blood glucose. Ensure adherence to prescribed diabetes medication (Metformin).")
        
    if not recommendations:
        recommendations.append("✅ Physiological vitals are normal. Maintain your balanced diet, hydration, and regular exercise routine.")
        
    return jsonify({
        'riskPercentage': risk_percentage,
        'riskLevel': risk_level,
        'clinicalRisk': round(clinical_risk * 100, 1),
        'lifestyleRisk': round(lifestyle_risk * 100, 1),
        'recommendations': recommendations,
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    })

if __name__ == '__main__':
    # Ensure static files directory exists
    os.makedirs(os.path.join(os.path.dirname(__file__), 'static'), exist_ok=True)
    # Run server on port 5000
    app.run(debug=True, host='0.0.0.0', port=5000)
