import pandas as pd

def calculate_kpis(df):
    """
    Calculates KPIs from the DataFrame.
    Assumes DataFrame has columns like 'Date', 'Expected Revenue', 'Deriv Revenue',
    'Partner Commissions', 'Total Deposits', 'Active Clients', 'FTT'.
    The 'Date' column should be convertible to datetime objects.
    """
    if df is None or df.empty:
        return {"error": "DataFrame is empty or None."}

    # Ensure required columns exist (example, adapt to your actual column names)
    required_columns = [
        'Date', 'Expected Revenue', 'Deriv Revenue', 'Partner Commissions',
        'Total Deposits', 'Active Clients', 'FTT'
    ]
    missing_cols = [col for col in required_columns if col not in df.columns]
    if missing_cols:
        return {"error": f"Missing required columns: {missing_cols}"}

    try:
        # Convert 'Date' column to datetime if it's not already
        if not pd.api.types.is_datetime64_any_dtype(df['Date']):
            df['Date'] = pd.to_datetime(df['Date'])
    except Exception as e:
        return {"error": f"Could not convert 'Date' column to datetime: {e}"}

    # Ensure numeric columns are numeric, coercing errors to NaN
    numeric_cols = ['Expected Revenue', 'Deriv Revenue', 'Partner Commissions', 'Total Deposits', 'Active Clients', 'FTT']
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    # Fill NaN values with 0 for aggregation, or handle as per your logic
    df[numeric_cols] = df[numeric_cols].fillna(0)

    # --- Calculate Monthly Active Partners ---
    # Define an active partner: one with Deriv Revenue > 0 in a given month.
    # Ensure 'Partner ID' column exists for this calculation
    monthly_active_partners_series = pd.Series(dtype='int64') # Default to empty series
    if 'Partner ID' in df.columns:
        # Filter for records where a partner might be considered active
        active_partner_records = df[df['Deriv Revenue'] > 0]
        if not active_partner_records.empty:
            monthly_active_partners_series = active_partner_records.groupby(df['Date'].dt.to_period('M'))['Partner ID'].nunique()
        else:
            # If no records with Deriv Revenue > 0, create a series with 0s for all months present in the original df
            all_months_in_df = df['Date'].dt.to_period('M').unique()
            monthly_active_partners_series = pd.Series(0, index=all_months_in_df)
    else:
        print("[KPI Calculator] Warning: 'Partner ID' column not found, cannot calculate monthly active partners.")
        # Create a series with 0s for all months present in the original df if 'Partner ID' is missing
        all_months_in_df = df['Date'].dt.to_period('M').unique()
        monthly_active_partners_series = pd.Series(0, index=all_months_in_df)

    # --- Total KPIs ---
    total_kpis = {
        'total_expected_revenue': df['Expected Revenue'].sum(),
        'total_deriv_revenue': df['Deriv Revenue'].sum(),
        'total_partner_commissions': df['Partner Commissions'].sum(),
        'total_total_deposits': df['Total Deposits'].sum(),
        'total_active_clients': df['Active Clients'].sum(), # This might need to be a unique count if clients appear multiple times
        'total_ftt': df['FTT'].sum()
    }

    # --- Monthly KPIs ---
    df['Month'] = df['Date'].dt.to_period('M')
    monthly_kpis_df = df.groupby('Month').agg(
        monthly_expected_revenue=('Expected Revenue', 'sum'),
        monthly_deriv_revenue=('Deriv Revenue', 'sum'),
        monthly_partner_commissions=('Partner Commissions', 'sum'),
        monthly_total_deposits=('Total Deposits', 'sum'),
        monthly_active_clients=('Active Clients', 'sum'), # Adjust if unique count needed per month
        monthly_ftt=('FTT', 'sum')
    ).reset_index()

    # Merge active partners count into the monthly_kpis_df
    if not monthly_active_partners_series.empty:
        # Get the index name properly and convert to string format
        monthly_active_partners_df = monthly_active_partners_series.rename('monthly_active_partners').reset_index()
        
        # The column from reset_index will have the name of the original index, which should be a period
        # Let's be safe and get the actual column name (first column) rather than assuming 'Date'
        period_column_name = monthly_active_partners_df.columns[0]
        
        # Convert period column to string
        monthly_active_partners_df['Month'] = monthly_active_partners_df[period_column_name].astype(str)
        
        # Convert monthly_kpis_df Month column to string
        monthly_kpis_df['Month'] = monthly_kpis_df['Month'].astype(str)
        
        # Merge on the string version of Month
        monthly_kpis_df = pd.merge(monthly_kpis_df, 
                                  monthly_active_partners_df[['Month', 'monthly_active_partners']], 
                                  on='Month', 
                                  how='left')
        monthly_kpis_df['monthly_active_partners'] = monthly_kpis_df['monthly_active_partners'].fillna(0).astype(int)
    else:
        # If monthly_active_partners_series is empty, add a column of zeros
        monthly_kpis_df['monthly_active_partners'] = 0

    # Convert Period to string for JSON serialization
    monthly_kpis_list = monthly_kpis_df.to_dict(orient='records')

    return {
        "total_kpis": total_kpis,
        "monthly_kpis": monthly_kpis_list
    }

# Example Usage (for testing, assuming a CSV or DataFrame is loaded elsewhere)
# if __name__ == '__main__':
#     # Create a sample DataFrame
#     data = {
#         'Date': pd.to_datetime(['2023-01-15', '2023-01-20', '2023-02-10', '2023-02-25', '2023-03-05']),
#         'Expected Revenue': [1000, 1200, 1100, 1300, 900],
#         'Deriv Revenue': [800, 900, 850, 1000, 700],
#         'Partner Commissions': [100, 120, 110, 130, 90],
#         'Total Deposits': [5000, 6000, 5500, 6500, 4500],
#         'Active Clients': [10, 12, 11, 13, 9],
#         'FTT': [2, 3, 1, 4, 2],
#         'Partner ID': ['P1', 'P2', 'P1', 'P3', 'P2'] 
#     }
#     sample_df = pd.DataFrame(data)
#     kpis = calculate_kpis(sample_df)
#     import json
#     print(json.dumps(kpis, indent=4)) 