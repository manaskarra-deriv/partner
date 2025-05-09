import os
import uuid
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
from werkzeug.utils import secure_filename
import traceback

from backend.utils.file_parser import parse_excel
from backend.utils.dotenv_loader import load_env, get_env_variable
from backend.analysis.kpi_calculator import calculate_kpis
from backend.analysis.performance_analyzer import analyze_performance, get_top_partner_for_metric_month
from backend.analysis.chatbot_service import set_current_df_for_chatbot, invoke_chatbot

# Load environment variables
load_env()

app = Flask(__name__)
CORS(app) # Enable CORS for all routes, or configure as needed

# Configure upload folder and allowed extensions
UPLOAD_FOLDER = 'uploads' # Make sure this folder exists or is created
PROCESSED_DATA_FOLDER = 'processed_data' # Folder to store processed data
METADATA_FILE = os.path.join(PROCESSED_DATA_FOLDER, 'metadata.json') # File to track processed files
ALLOWED_EXTENSIONS = {'xlsx'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Ensure necessary folders exist
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
if not os.path.exists(PROCESSED_DATA_FOLDER):
    os.makedirs(PROCESSED_DATA_FOLDER)

# Initialize or load metadata tracking
def load_metadata():
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading metadata file: {e}")
            return {"files": {}}
    else:
        return {"files": {}}

def save_metadata(metadata):
    try:
        with open(METADATA_FILE, 'w') as f:
            json.dump(metadata, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving metadata file: {e}")
        return False

# Load metadata at startup
metadata = load_metadata()
print(f"Loaded metadata tracking {len(metadata['files'])} processed files")

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload', methods=['POST'])
def upload_file():
    print("--- Received request to /upload ---")
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    
    # Get data source from form data
    source = request.form.get('source', 'unknown')
    print(f"Uploading file for source: {source}")
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        try:
            file.save(file_path)
        except Exception as e:
            return jsonify({"error": f"Failed to save file: {str(e)}"}), 500

        # 1. Parse Excel to DataFrame
        df = parse_excel(file_path)
        if df is None or (isinstance(df, dict) and 'error' in df):
            error_msg = df['error'] if isinstance(df, dict) else "Failed to parse Excel file into DataFrame."
            # Clean up uploaded file
            try:
                os.remove(file_path)
            except OSError as e_os:
                print(f"Error deleting file {file_path}: {e_os}")
            return jsonify({"error": error_msg}), 500
        
        # Ensure DataFrame is not empty after parsing
        if df.empty:
            try:
                os.remove(file_path)
            except OSError as e_os:
                print(f"Error deleting file {file_path}: {e_os}")
            return jsonify({"error": "Parsed DataFrame is empty."}), 500
            
        # Print DataFrame columns for debugging
        print("--- DataFrame Columns Found ---")
        print(list(df.columns))
        print("-----------------------------")

        # Data Transformation Logic 
        print("--- Transforming DataFrame --- ")
        try:
            # Make a copy to avoid modifying the original df if needed elsewhere
            df_transformed = df.copy()

            # Store original columns before manipulation
            original_columns = df_transformed.columns

            # --- Clean MultiIndex Header --- 
            # Forward fill the metric names (level 0) across columns where it's 'Unnamed' or potentially 'NaT'
            new_cols_level0 = []
            last_valid_metric = None
            # We need to iterate carefully, assuming metric names appear before their date columns
            # This logic might need adjustment based on the *exact* column structure
            for i, col_tuple in enumerate(original_columns):
                level0, level1 = col_tuple
                # Assume first few columns are IDs and don't have metric names in level 0
                if i < 3:
                    last_valid_metric = level0 # Or maybe None, depending on structure
                    new_cols_level0.append(level0) # Keep original ID level 0 name
                    continue
                
                # Check if level0 looks like a valid metric name (not 'Unnamed...', not 'NaT')
                if not str(level0).startswith('Unnamed:') and pd.notna(level0):
                    last_valid_metric = level0
                    new_cols_level0.append(level0)
                # If it's unnamed/NaT but we have a previous metric, use that
                elif last_valid_metric:
                    new_cols_level0.append(last_valid_metric)
                # Otherwise, keep the original (might still be 'Unnamed' if it's an unexpected structure)
                else:
                    new_cols_level0.append(level0)
            
            # Assign the cleaned level 0 and original level 1 back to the columns
            df_transformed.columns = pd.MultiIndex.from_tuples(list(zip(new_cols_level0, original_columns.get_level_values(1))))
            # -----> ADDED: Name the MultiIndex levels <-----
            df_transformed.columns.names = ['Metric', 'Date_Str'] 
            print("Cleaned MultiIndex columns (showing first few):", list(df_transformed.columns[:15]))
            
            # --- Identify ID columns and Melt --- 
            id_vars_multiindex = df_transformed.columns[:3]
            id_vars_list = list(id_vars_multiindex)
            print(f"Melting with id_vars: {id_vars_list}")
            # -----> REMOVED var_name argument <-----
            df_long = pd.melt(df_transformed, id_vars=id_vars_list, value_name='Value')

            # --- Clean up Melted Data --- 
            # Rename ID columns (Target the tuples that exist post-melt)
            id_rename_map_tuples = {
                ('Unnamed: 0_level_0', 'affiliate_id'): 'Partner ID',
                ('Unnamed: 1_level_0', "partner's country"): 'Country',
                ('Unnamed: 2_level_0', 'GP Team Region'): 'Region'
            }
            df_long.rename(columns=id_rename_map_tuples, inplace=True)
            print(f"Columns after melting and ID rename: {list(df_long.columns)}")

            # Convert Date_Str to datetime objects
            df_long['Date_Str_Clean'] = df_long['Date_Str'].astype(str).str.split('.').str[0]
            df_long['Date'] = pd.to_datetime(df_long['Date_Str_Clean'], errors='coerce')
            df_long = df_long.dropna(subset=['Date'])

            # ---> ADDED: Convert Value column to numeric, coercing errors to NaN <---
            df_long['Value'] = pd.to_numeric(df_long['Value'], errors='coerce')
            # Optionally, decide how to handle NaNs created from non-numeric values (e.g., fill with 0?)
            # df_long['Value'] = df_long['Value'].fillna(0)

            # Pivot the table to get metrics as columns
            # ---> MODIFIED: Added aggfunc='sum' <--- 
            df_final = df_long.pivot_table(
                index=['Partner ID', 'Country', 'Region', 'Date'], 
                columns='Metric', 
                values='Value',
                aggfunc='sum' # Specify aggregation function
            ).reset_index()

            # Rename metric columns to match expected names
            # Important: Adjust keys here based on the *actual* metric names in level 0 of your MultiIndex
            metric_rename_map = {
                'Expected Revenue': 'Expected Revenue',
                'Deriv Revenue': 'Deriv Revenue',
                'Partners\' Commissions': 'Partner Commissions', # Note the apostrophe difference
                'Total Deposits': 'Total Deposits',
                'Active Clients': 'Active Clients',
                'First Time Traders': 'FTT'
                # Add mappings for 'Band', 'Partners' Performance Index', 'Client Retention Rate' if needed
                # Or handle/drop them if they are not needed for these specific KPIs
            }
            df_final.rename(columns=metric_rename_map, inplace=True)
            df_final.columns.name = None # Remove the index name ('Metric')

            print("--- Transformed DataFrame Head ---")
            print(df_final.head())
            print("--- Transformed DataFrame Columns ---")
            print(list(df_final.columns))
            print("---------------------------------")

        except Exception as e:
            print(f"!!! Error during DataFrame transformation: {e} !!!")
            print(traceback.format_exc()) # Print detailed traceback for transformation errors
            # Clean up uploaded file
            try:
                os.remove(file_path)
            except OSError as e_os:
                print(f"Error deleting file {file_path}: {e_os}")
            return jsonify({"error": f"Failed to transform data structure: {e}"}), 500

        # Add data source as a column for future reference
        df_final['DataSource'] = source

        # Generate Unique ID and Save Processed Data
        file_id = str(uuid.uuid4())
        processed_df_path = os.path.join(PROCESSED_DATA_FOLDER, f"{file_id}.feather")

        try:
            print(f"--- Saving transformed DataFrame to {processed_df_path} ---")
            df_final.to_feather(processed_df_path)
            set_current_df_for_chatbot(df_final, file_id)
            
            # Update metadata to track this file
            metadata['files'][file_id] = {
                'filename': filename,
                'source': source,
                'processed_path': processed_df_path,
                'upload_date': pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            save_metadata(metadata)
            
            # Store file_id in session storage based on source
            if source == 'myAffiliate':
                session_key = 'myAffiliateId'
            elif source == 'dynamicWorks':
                session_key = 'dynamicWorksId'
            else:
                session_key = 'currentFileId'
            
        except Exception as e:
            print(f"!!! Error saving processed DataFrame: {e} !!!")
            # Decide if this should be fatal
            try: os.remove(file_path) # Cleanup original upload
            except OSError: pass
            return jsonify({"error": f"Could not save processed data: {e}"}), 500

        # 2. Calculate KPIs
        kpi_results = calculate_kpis(df_final.copy())
        if 'error' in kpi_results:
            print(f"KPI Calculation Error on transformed data: {kpi_results['error']}")
            return jsonify({"error": f"KPI Calculation Error: {kpi_results['error']}"}), 500

        # 3. Perform Performance Analysis
        performance_results = analyze_performance(df_final.copy())
        if 'error' in performance_results:
            print(f"Performance Analysis Error on transformed data: {performance_results['error']}")
            return jsonify({"error": f"Performance Analysis Error: {performance_results['error']}"}), 500

        # Cleanup original uploaded file
        try:
            os.remove(file_path)
            print(f"Cleaned up original file: {file_path}")
        except OSError as e:
            print(f"Error deleting uploaded file {file_path}: {e}")

        print(f"--- Upload successful for fileId: {file_id}, source: {source} ---")
        return jsonify({
            "message": "File processed successfully",
            "fileId": file_id,
            "kpis": kpi_results,
            "performance_analysis": performance_results,
            "filename": filename,
            "source": source
        }), 200
    else:
        return jsonify({"error": "File type not allowed"}), 400

@app.route('/load-stored-files', methods=['GET'])
def load_stored_files():
    """
    Endpoint to retrieve all stored processed files.
    This allows the frontend to discover and use files that were uploaded in previous sessions.
    """
    print("--- Received request to load stored files ---")
    
    # Return all metadata about stored files
    stored_files = []
    for file_id, file_info in metadata['files'].items():
        # Check if the file still exists
        if os.path.exists(file_info['processed_path']):
            stored_files.append({
                'fileId': file_id,
                'filename': file_info['filename'],
                'source': file_info['source'],
                'uploadDate': file_info['upload_date']
            })
        else:
            # Remove from metadata if file no longer exists
            print(f"Removing missing file from metadata: {file_id}")
            del metadata['files'][file_id]
    
    # Save updated metadata if any files were removed
    save_metadata(metadata)
    
    return jsonify({
        "storedFiles": stored_files
    }), 200

@app.route('/get-analysis-data/<file_id>', methods=['GET'])
def get_analysis_data(file_id):
    print(f"--- Received request to get analysis data for fileId: {file_id} ---")
    
    # First check if file exists in our metadata
    if file_id not in metadata['files']:
        print(f"File ID not found in metadata: {file_id}")
        return jsonify({"error": "File ID not found in stored files. Please upload the file again."}), 404
    
    file_info = metadata['files'][file_id]
    processed_df_path = file_info['processed_path']

    # Get date range parameters from query string
    start_date = request.args.get('startDate')
    end_date = request.args.get('endDate')
    preset = request.args.get('preset', 'all')

    print(f"Date filtering requested - preset: {preset}, startDate: {start_date}, endDate: {end_date}")

    if not os.path.exists(processed_df_path):
        print(f"Processed data file not found: {processed_df_path}")
        # Remove from metadata since file doesn't exist
        del metadata['files'][file_id]
        save_metadata(metadata)
        return jsonify({"error": "Processed data not found. Please upload the file again."}), 404

    try:
        print(f"Loading DataFrame from {processed_df_path}")
        df_final = pd.read_feather(processed_df_path)
        
        original_row_count = len(df_final)
        print(f"Original data row count: {original_row_count}")
        
        # Apply date filtering if parameters are provided
        if start_date and end_date:
            try:
                start_date = pd.to_datetime(start_date)
                end_date = pd.to_datetime(end_date)
                
                # Add one day to end_date to include the end date in the range
                end_date = end_date + pd.Timedelta(days=1)
                
                # Ensure Date column is datetime
                if not pd.api.types.is_datetime64_any_dtype(df_final['Date']):
                    df_final['Date'] = pd.to_datetime(df_final['Date'])
                
                # Filter the DataFrame by date range
                df_filtered = df_final[(df_final['Date'] >= start_date) & (df_final['Date'] < end_date)]
                
                filtered_row_count = len(df_filtered)
                print(f"Filtered data by date range: {start_date.strftime('%Y-%m-%d')} to {(end_date - pd.Timedelta(days=1)).strftime('%Y-%m-%d')}")
                print(f"Filtered data row count: {filtered_row_count} (removed {original_row_count - filtered_row_count} rows)")
                
                # Use the filtered dataframe for further processing
                df_final = df_filtered
                
                # If the filtered data is empty, log a warning
                if filtered_row_count == 0:
                    print(f"WARNING: Filtered data is empty for date range {start_date.strftime('%Y-%m-%d')} to {(end_date - pd.Timedelta(days=1)).strftime('%Y-%m-%d')}")
                
            except Exception as e:
                print(f"Error applying date filter: {e}")
                print(traceback.format_exc())
                # Continue with unfiltered data if date filtering fails
        else:
            print("No date filtering applied - using all data")
        
        set_current_df_for_chatbot(df_final, file_id)
        
        # Re-run analysis on the loaded (and potentially filtered) data
        kpi_results = calculate_kpis(df_final.copy())
        performance_results = analyze_performance(df_final.copy())

        if isinstance(kpi_results, dict) and 'error' in kpi_results:
             return jsonify({"error": f"KPI Calculation Error on loaded data: {kpi_results['error']}"}), 500
        if isinstance(performance_results, dict) and 'error' in performance_results:
            return jsonify({"error": f"Performance Analysis Error on loaded data: {performance_results['error']}"}), 500

        print(f"--- Successfully retrieved analysis data for fileId: {file_id} ---")
        return jsonify({
             "kpis": kpi_results, 
             "performance_analysis": performance_results
        }), 200

    except Exception as e:
        print(f"!!! Error loading/analyzing processed data for {file_id}: {e} !!!")
        print(traceback.format_exc())
        return jsonify({"error": f"Failed to retrieve analysis data: {e}"}), 500

@app.route('/get-top-partner', methods=['POST'])
def get_top_partner_endpoint():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    file_id = data.get('fileId')
    metric_column = data.get('metric')
    year = data.get('year')
    month = data.get('month')

    if not all([file_id, metric_column, year, month]):
        return jsonify({"error": "Missing required parameters: fileId, metric, year, month"}), 400
    
    try:
        year = int(year)
        month = int(month)
    except ValueError:
        return jsonify({"error": "Year and month must be integers"}), 400

    print(f"--- Received request for top partner: fileId={file_id}, metric={metric_column}, year={year}, month={month} ---")

    processed_df_path = os.path.join(PROCESSED_DATA_FOLDER, f"{file_id}.feather")
    if not os.path.exists(processed_df_path):
        return jsonify({"error": "Processed data not found."}), 404

    try:
        df_final = pd.read_feather(processed_df_path)
        result = get_top_partner_for_metric_month(df_final, metric_column, year, month)
        
        if 'error' in result:
            return jsonify(result), 400 # Or 500 if it's an internal processing error
        return jsonify(result), 200

    except Exception as e:
        print(f"!!! Error in /get-top-partner endpoint for {file_id}: {e} !!!")
        print(traceback.format_exc())
        return jsonify({"error": f"Failed to get top partner: {e}"}), 500

@app.route('/chat', methods=['POST'])
def chat_endpoint():
    data = request.get_json()
    if not data or 'query' not in data or 'fileId' not in data:
        return jsonify({"error": "Missing query or fileId"}), 400

    user_query = data['query']
    file_id = data['fileId'] # For context, ensuring chatbot operates on the right file's data
    chat_history_frontend = data.get('chat_history', []) # Get chat_history if sent

    # Ensure the correct DataFrame is loaded for the chatbot context for this file_id
    # This might involve re-calling set_current_df_for_chatbot if the global one is not for this file_id
    # For simplicity now, we assume set_current_df_for_chatbot was called by /upload or /get-analysis-data
    # A more robust system would check if chatbot_service.current_file_id_for_tools matches file_id
    # and reload if necessary.
    print(f"--- Received chat query for fileId '{file_id}': '{user_query}' ---")
    
    # Convert frontend chat history to proper format for the chatbot
    # We're now passing the chat history to the chatbot
    response_text = invoke_chatbot(user_query, chat_history_frontend)
    
    return jsonify({"answer": response_text}), 200

@app.route('/get-comparison-data', methods=['POST'])
def get_comparison_data():
    """
    Endpoint for comparing data between MyAffiliate and DynamicWorks sources.
    Expects JSON payload containing:
    - myAffiliateId: ID of the MyAffiliate file
    - dynamicWorksId: ID of the DynamicWorks file
    - metricsToCompare: List of metrics to include in comparison
    - timeframe: Time frame for comparison (e.g., 'monthly')
    """
    print("--- Received request to /get-comparison-data ---")
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    my_affiliate_id = data.get('myAffiliateId')
    dynamic_works_id = data.get('dynamicWorksId')
    metrics_to_compare = data.get('metricsToCompare', [])
    timeframe = data.get('timeframe', 'monthly')

    if not my_affiliate_id or not dynamic_works_id:
        return jsonify({"error": "Both myAffiliateId and dynamicWorksId are required"}), 400

    print(f"Comparing - MyAffiliate ID: {my_affiliate_id}, DynamicWorks ID: {dynamic_works_id}")
    print(f"Metrics to compare: {metrics_to_compare}")

    # Check if the processed data files exist
    ma_file_path = os.path.join(PROCESSED_DATA_FOLDER, f"{my_affiliate_id}.feather")
    dw_file_path = os.path.join(PROCESSED_DATA_FOLDER, f"{dynamic_works_id}.feather")

    if not os.path.exists(ma_file_path):
        return jsonify({"error": f"MyAffiliate data file not found for ID: {my_affiliate_id}"}), 404
    if not os.path.exists(dw_file_path):
        return jsonify({"error": f"DynamicWorks data file not found for ID: {dynamic_works_id}"}), 404

    try:
        # Load both dataframes
        ma_df = pd.read_feather(ma_file_path)
        dw_df = pd.read_feather(dw_file_path)

        # Ensure Date column is datetime
        if not pd.api.types.is_datetime64_any_dtype(ma_df['Date']):
            ma_df['Date'] = pd.to_datetime(ma_df['Date'])
        if not pd.api.types.is_datetime64_any_dtype(dw_df['Date']):
            dw_df['Date'] = pd.to_datetime(dw_df['Date'])

        # Filter data to only include Oct 2024 through April 2025
        # This is for consistency with the frontend date filters
        ma_df = ma_df[(ma_df['Date'].dt.year == 2024) & (ma_df['Date'].dt.month >= 10) | 
                       (ma_df['Date'].dt.year == 2025) & (ma_df['Date'].dt.month <= 4)]
        dw_df = dw_df[(dw_df['Date'].dt.year == 2024) & (dw_df['Date'].dt.month >= 10) | 
                       (dw_df['Date'].dt.year == 2025) & (dw_df['Date'].dt.month <= 4)]

        # Prepare result structure
        comparison_result = {
            "months": []
        }

        # Add metrics based on what was requested
        for metric in metrics_to_compare:
            if metric in ma_df.columns and metric in dw_df.columns:
                comparison_result[metric.lower().replace(' ', '')] = {
                    "myAffiliate": [],
                    "dynamicWorks": []
                }

        # Generate month labels (Oct 2024 - Apr 2025)
        date_range = pd.date_range(start='2024-10-01', end='2025-04-30', freq='MS')
        month_labels = [d.strftime('%Y-%m') for d in date_range]
        comparison_result["months"] = month_labels

        # Aggregate data by month for each source and metric
        for metric in metrics_to_compare:
            if metric in ma_df.columns and metric in dw_df.columns:
                # Create period column for grouping
                ma_df['Month'] = ma_df['Date'].dt.to_period('M')
                dw_df['Month'] = dw_df['Date'].dt.to_period('M')

                # Group by Month and calculate sums
                ma_monthly = ma_df.groupby('Month')[metric].sum().reset_index()
                dw_monthly = dw_df.groupby('Month')[metric].sum().reset_index()

                # Convert period to string format
                ma_monthly['Month'] = ma_monthly['Month'].astype(str)
                dw_monthly['Month'] = dw_monthly['Month'].astype(str)

                # Ensure all months are included (filling with 0 for missing months)
                for month in month_labels:
                    # MyAffiliate
                    ma_value = ma_monthly.loc[ma_monthly['Month'] == month, metric].values
                    ma_value = ma_value[0] if len(ma_value) > 0 else 0
                    comparison_result[metric.lower().replace(' ', '')]["myAffiliate"].append(ma_value)

                    # DynamicWorks
                    dw_value = dw_monthly.loc[dw_monthly['Month'] == month, metric].values
                    dw_value = dw_value[0] if len(dw_value) > 0 else 0
                    comparison_result[metric.lower().replace(' ', '')]["dynamicWorks"].append(dw_value)

        # Handle special metrics renaming for frontend
        metrics_mapping = {
            'derivrevenue': 'Deriv Revenue',
            'partnercommissions': 'Partner Commissions',
            'activeclients': 'Active Clients',
            'ftt': 'FTT',
            'firsttimetraders': 'FTT'
        }

        for frontend_key, backend_metric in metrics_mapping.items():
            if backend_metric in metrics_to_compare:
                comparison_result[frontend_key] = comparison_result.get(backend_metric.lower().replace(' ', ''), {"myAffiliate": [], "dynamicWorks": []})

        return jsonify(comparison_result), 200

    except Exception as e:
        print(f"!!! Error generating comparison data: {e} !!!")
        print(traceback.format_exc())
        return jsonify({"error": f"Failed to generate comparison data: {e}"}), 500

@app.route('/get-team-regions/<file_id>', methods=['GET'])
def get_team_regions(file_id):
    """
    Endpoint to get unique GP Team Regions from the provided file.
    Used for filtering in the Country Analysis view.
    """
    print(f"--- Received request to get team regions for fileId: {file_id} ---")
    processed_df_path = os.path.join(PROCESSED_DATA_FOLDER, f"{file_id}.feather")

    if not os.path.exists(processed_df_path):
        print(f"Processed data file not found: {processed_df_path}")
        return jsonify({"error": "Processed data not found. Please upload the file again."}), 404

    try:
        df = pd.read_feather(processed_df_path)
        
        if 'Region' not in df.columns:
            return jsonify({"error": "Region column not found in the data."}), 400
        
        # Get unique regions, filter out None/NA values, and sort
        regions = df['Region'].dropna().unique().tolist()
        regions = sorted([region for region in regions if region and pd.notna(region)])
        
        return jsonify({"regions": regions}), 200

    except Exception as e:
        print(f"!!! Error fetching team regions for {file_id}: {e} !!!")
        print(traceback.format_exc())
        return jsonify({"error": f"Failed to fetch team regions: {e}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000) 