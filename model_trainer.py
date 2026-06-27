import pandas as pd
import numpy as np
import os
import joblib
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

def train_clinical_model(data_dir, output_dir):
    print("\n--- Training Clinical Model (Model A) ---")
    heart_csv = os.path.join(data_dir, "heart.csv")
    if not os.path.exists(heart_csv):
        # Check alternative location
        heart_csv = os.path.join(data_dir, "processed.cleveland.data")
        if not os.path.exists(heart_csv):
            raise FileNotFoundError("Could not find heart.csv or processed.cleveland.data")
    
    # Load dataset
    df = pd.read_csv(heart_csv)
    
    # Define features and target
    target_col = 'target' if 'target' in df.columns else df.columns[-1]
    X = df.drop(columns=[target_col])
    y = df[target_col]
    
    feature_names = X.columns.tolist()
    print(f"Features: {feature_names}")
    print(f"Dataset shape: {df.shape}")
    
    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train Random Forest Classifier
    clf = RandomForestClassifier(n_estimators=150, max_depth=8, random_state=42)
    clf.fit(X_train_scaled, y_train)
    
    # Evaluate
    y_pred = clf.predict(X_test_scaled)
    acc = accuracy_score(y_test, y_pred)
    print(f"Validation Accuracy: {acc * 100:.2f}%")
    print(classification_report(y_test, y_pred))
    
    # Save Model and Scaler
    model_path = os.path.join(output_dir, "clinical_model.pkl")
    scaler_path = os.path.join(output_dir, "clinical_scaler.pkl")
    joblib.dump(clf, model_path)
    joblib.dump(scaler, scaler_path)
    joblib.dump(feature_names, os.path.join(output_dir, "clinical_features.pkl"))
    print("Clinical Model and Scaler saved successfully.")

def train_lifestyle_model(data_dir, output_dir):
    print("\n--- Training Lifestyle & Profile Model (Model B) ---")
    lifestyle_csv = os.path.join(data_dir, "heart_attack_prediction_dataset.csv")
    if not os.path.exists(lifestyle_csv):
        raise FileNotFoundError("Could not find heart_attack_prediction_dataset.csv")
        
    df = pd.read_csv(lifestyle_csv)
    print(f"Dataset shape: {df.shape}")
    
    # Preprocessing
    # Parse Blood Pressure 'Systolic/Diastolic'
    if 'Blood Pressure' in df.columns:
        bp_split = df['Blood Pressure'].str.split('/', expand=True).astype(float)
        df['Systolic_BP'] = bp_split[0]
        df['Diastolic_BP'] = bp_split[1]
        df = df.drop(columns=['Blood Pressure'])
    
    # Drop irrelevant columns
    cols_to_drop = ['Patient ID', 'Country', 'Continent', 'Hemisphere']
    df = df.drop(columns=[col for col in cols_to_drop if col in df.columns])
    
    # Handle Sex encoding (Male/Female -> 1/0)
    if 'Sex' in df.columns:
        df['Sex'] = df['Sex'].map({'Male': 1, 'Female': 0})
        
    # Handle Diet encoding
    if 'Diet' in df.columns:
        df['Diet'] = df['Diet'].map({'Healthy': 2, 'Average': 1, 'Unhealthy': 0})
        # If any missing/NaN maps, fill with Average
        df['Diet'] = df['Diet'].fillna(1)
        
    # Define features and target
    target_col = 'Heart Attack Risk'
    X = df.drop(columns=[target_col])
    y = df[target_col]
    
    feature_names = X.columns.tolist()
    print(f"Features: {feature_names}")
    
    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train Classifier
    clf = RandomForestClassifier(n_estimators=200, max_depth=10, random_state=42)
    clf.fit(X_train_scaled, y_train)
    
    # Evaluate
    y_pred = clf.predict(X_test_scaled)
    acc = accuracy_score(y_test, y_pred)
    print(f"Validation Accuracy: {acc * 100:.2f}%")
    print(classification_report(y_test, y_pred))
    
    # Save Model, Scaler, and Features
    model_path = os.path.join(output_dir, "lifestyle_model.pkl")
    scaler_path = os.path.join(output_dir, "lifestyle_scaler.pkl")
    joblib.dump(clf, model_path)
    joblib.dump(scaler, scaler_path)
    joblib.dump(feature_names, os.path.join(output_dir, "lifestyle_features.pkl"))
    print("Lifestyle Model and Scaler saved successfully.")

if __name__ == "__main__":
    data_dir = r"e:\Avishkar 2025\data"
    output_dir = r"e:\Avishkar 2025\server\trained_models"
    os.makedirs(output_dir, exist_ok=True)
    
    train_clinical_model(data_dir, output_dir)
    train_lifestyle_model(data_dir, output_dir)
    print("\n[SUCCESS] All models trained and exported!")
