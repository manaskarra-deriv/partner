import pandas as pd
import numpy as np

def analyze_performance(df):
    """
    Analyzes partner and regional performance.
    Assumes df has columns like 'Partner ID', 'Deriv Revenue', 'Date',
    'Region', 'Country'.
    The 'Date' column should be convertible to datetime objects.
    Numeric columns for metrics are expected.
    """
    if df is None or df.empty:
        return {"error": "DataFrame is empty or None for performance analysis."}

    base_required_columns = ['Partner ID', 'Deriv Revenue', 'Date']
    regional_required_columns = base_required_columns + ['Region', 'Country']

    # Check for base columns first
    missing_base_cols = [col for col in base_required_columns if col not in df.columns]
    if missing_base_cols:
        return {"error": f"Missing base columns for performance analysis: {missing_base_cols}"}
    
    # Convert 'Date' and ensure 'Deriv Revenue' is numeric
    try:
        if not pd.api.types.is_datetime64_any_dtype(df['Date']):
            df['Date'] = pd.to_datetime(df['Date'])
        df['Deriv Revenue'] = pd.to_numeric(df['Deriv Revenue'], errors='coerce').fillna(0)
    except Exception as e:
        return {"error": f"Error processing Date or Deriv Revenue columns: {e}"}

    # --- Partner Performance ---
    # Calculate total revenue per partner
    partner_revenue_total = df.groupby('Partner ID')['Deriv Revenue'].sum().sort_values(ascending=False)
    
    # Get top 10 partners by total revenue
    top_partners_revenue = partner_revenue_total.head(10).reset_index()
    top_partner_ids = top_partners_revenue['Partner ID'].tolist()

    # Get corresponding Country and Region for these top partners
    # Assumes Country and Region are consistent for a Partner ID, takes the first found
    if 'Country' in df.columns and 'Region' in df.columns:
        partner_details = df[df['Partner ID'].isin(top_partner_ids)][['Partner ID', 'Country', 'Region']]\
                            .drop_duplicates(subset=['Partner ID'], keep='first')
        # Merge details with revenue
        top_partners_merged = pd.merge(top_partners_revenue, partner_details, on='Partner ID', how='left')
    else:
        # If Country/Region columns don't exist, just use revenue data
        top_partners_merged = top_partners_revenue
        top_partners_merged['Country'] = 'N/A' # Add placeholder columns
        top_partners_merged['Region'] = 'N/A'
        
    top_partners_list = top_partners_merged.to_dict(orient='records')

    # Get bottom 10 partners
    bottom_partners_revenue = partner_revenue_total.tail(10).sort_values().reset_index()
    # Optionally merge details for bottom partners too (similar logic as above)
    bottom_partners_list = bottom_partners_revenue.to_dict(orient='records')
    
    # Potentially underperforming/loss-generating (example: Deriv Revenue <= 0)
    # Modified approach to preserve Country and Region information
    loss_records = df[df['Deriv Revenue'] <= 0].copy()
    
    if not loss_records.empty:
        # First check if Country and Region columns exist
        if 'Country' in loss_records.columns and 'Region' in loss_records.columns:
            # Group by Partner ID, Country, and Region to preserve these fields
            loss_making_partners = loss_records.groupby(['Partner ID', 'Country', 'Region'])['Deriv Revenue'].sum().reset_index()
        else:
            # If Country and Region are not available, just group by Partner ID
            loss_making_partners = loss_records.groupby('Partner ID')['Deriv Revenue'].sum().reset_index()
            loss_making_partners['Country'] = 'N/A'
            loss_making_partners['Region'] = 'N/A'
        
        # Sort by Deriv Revenue (ascending) to have the most negative at the top
        loss_making_partners = loss_making_partners.sort_values('Deriv Revenue').reset_index(drop=True)
    else:
        # Create an empty DataFrame with the correct columns if no loss-making partners
        loss_making_partners = pd.DataFrame(columns=['Partner ID', 'Deriv Revenue', 'Country', 'Region'])
    
    # Filter to only include partners with negative revenue
    underperforming_partners_list = loss_making_partners[loss_making_partners['Deriv Revenue'] < 0].to_dict(orient='records')

    # ---> ADDED: Analyze partners with positive commissions <---
    partners_with_positive_commissions_list = []
    if 'Partner Commissions' in df.columns:
        try:
            df['Partner Commissions'] = pd.to_numeric(df['Partner Commissions'], errors='coerce').fillna(0)
            positive_commissions_df = df[df['Partner Commissions'] > 0].copy()
            if not positive_commissions_df.empty:
                # Ensure 'Date' is datetime for month extraction
                if not pd.api.types.is_datetime64_any_dtype(positive_commissions_df['Date']):
                    positive_commissions_df['Date'] = pd.to_datetime(positive_commissions_df['Date'])
                
                positive_commissions_df['YearMonth'] = positive_commissions_df['Date'].dt.to_period('M')
                
                # Count of months with positive commission per partner
                positive_commission_months_count = positive_commissions_df.groupby('Partner ID')['YearMonth'].nunique().sort_values(ascending=False)
                
                # Sum of commissions for these partners
                total_positive_commissions = positive_commissions_df.groupby('Partner ID')['Partner Commissions'].sum()
                
                # Combine the information
                partner_commission_summary = pd.DataFrame({
                    'PositiveCommissionMonths': positive_commission_months_count,
                    'TotalCommissionsReceived': total_positive_commissions
                }).reset_index()
                
                # Add Country and Region if available
                if 'Country' in df.columns and 'Region' in df.columns:
                    partner_details_for_commission = df[df['Partner ID'].isin(partner_commission_summary['Partner ID'].tolist())][['Partner ID', 'Country', 'Region']]\
                                                       .drop_duplicates(subset=['Partner ID'], keep='first')
                    partner_commission_summary = pd.merge(partner_commission_summary, partner_details_for_commission, on='Partner ID', how='left')
                else:
                    partner_commission_summary['Country'] = 'N/A'
                    partner_commission_summary['Region'] = 'N/A'

                partners_with_positive_commissions_list = partner_commission_summary.to_dict(orient='records')
        except Exception as e:
            print(f"Error analyzing positive commissions: {e}") # Log error
            # Optionally add error info to results
            performance_results["positive_commissions_analysis_error"] = str(e)

    performance_results = {
        "top_partners_by_revenue": top_partners_list,
        "bottom_partners_by_revenue": bottom_partners_list,
        "underperforming_partners": underperforming_partners_list,
        "partners_with_positive_commissions": partners_with_positive_commissions_list # Added new key
    }

    # --- Regional/Country Trends (Requires Region and Country columns) ---
    missing_regional_cols = [col for col in regional_required_columns if col not in df.columns]
    if not missing_regional_cols:
        df['Month'] = df['Date'].dt.to_period('M')

        # Growth/decline by region over time
        regional_trends = df.groupby(['Month', 'Region'])['Deriv Revenue'].sum().reset_index()
        regional_trends['Month'] = regional_trends['Month'].astype(str)
        # Pivot for easier charting (Month as index, Region as columns)
        # regional_pivot = regional_trends.pivot(index='Month', columns='Region', values='Deriv Revenue').fillna(0).reset_index()
        performance_results["regional_revenue_trends"] = regional_trends.to_dict(orient='records')

        # Growth/decline by country over time
        country_trends = df.groupby(['Month', 'Country'])['Deriv Revenue'].sum().reset_index()
        country_trends['Month'] = country_trends['Month'].astype(str)
        # country_pivot = country_trends.pivot(index='Month', columns='Country', values='Deriv Revenue').fillna(0).reset_index()
        performance_results["country_revenue_trends"] = country_trends.to_dict(orient='records')
        
        # At-risk partners/regions (placeholder - complex logic, e.g., consistent decline)
        # This would require more sophisticated trend analysis (e.g., rolling averages, slope of revenue over time)
        performance_results["at_risk_partners_regions_notes"] = "At-risk detection requires more advanced trend analysis (e.g., consistent decline over several periods). Placeholder."
    else:
        performance_results["regional_analysis_skipped"] = f"Skipped regional/country analysis due to missing columns: {missing_regional_cols}"

    # --- Partner Retention and Churn (Placeholder) ---
    # This is complex and typically requires tracking active partners month over month.
    # You need a clear definition of an "active" partner for a given period.
    # Then, compare cohorts of partners across periods.
    performance_results["partner_retention_churn_notes"] = "Partner retention and churn analysis is complex and requires longitudinal tracking of partner activity. Placeholder."

    return performance_results

def convert_numpy_types(obj):
    """
    Convert numpy types to native Python types for JSON serialization.
    This function recursively converts all numpy data types within a dict, list, or scalar.
    """
    if isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, (np.integer, np.int64)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return convert_numpy_types(obj.tolist())
    elif isinstance(obj, (np.bool_)):
        return bool(obj)
    elif isinstance(obj, (np.datetime64, pd.Timestamp)):
        return str(obj)
    else:
        return obj

def get_top_partner_for_metric_month(df, metric, year, month):
    """Finds the top performing partner for a specific metric in a given month."""
    try:
        # Ensure Date column is datetime type
        if not pd.api.types.is_datetime64_any_dtype(df['Date']):
            df['Date'] = pd.to_datetime(df['Date'])
        
        # Filter by year and month
        filtered_df = df[(df['Date'].dt.year == year) & (df['Date'].dt.month == month)]
        
        if filtered_df.empty:
            return {"message": f"No data found for {month}/{year}"}
        
        if metric not in filtered_df.columns:
            return {"error": f"Metric '{metric}' not found in data"}
        
        # Group by Partner ID and get the sum of the metric
        partner_performance = filtered_df.groupby(['Partner ID', 'Country', 'Region'])[metric].sum().reset_index()
        
        if partner_performance.empty:
            return {"message": f"No data found for {metric} in {month}/{year}"}
        
        # Find the partner with the highest value for the metric
        top_partner_row = partner_performance.loc[partner_performance[metric].idxmax()]
        
        # Convert to a dictionary
        top_partner_dict = top_partner_row.to_dict()
        
        # Add Year, Month, and Metric to the result for display
        top_partner_dict['Year'] = year
        top_partner_dict['Month'] = month
        top_partner_dict['Metric'] = metric
        
        # Convert any numpy types to Python native types for JSON serialization
        return convert_numpy_types(top_partner_dict)
        
    except Exception as e:
        return {"error": f"Error analyzing top partner: {str(e)}"}

# ---> ADDED: Function to count partners by country <---
def get_partner_counts_by_country(df):
    """Count the number of unique partners per country."""
    try:
        # Check if required columns exist
        if 'Country' not in df.columns or 'Partner ID' not in df.columns:
            return {"error": "Required columns 'Country' and/or 'Partner ID' not found in dataset."}
        
        # Group by Country and get unique Partner ID count
        country_partner_counts = df.groupby('Country')['Partner ID'].nunique().reset_index()
        country_partner_counts.columns = ['Country', 'UniquePartnerCount']
        
        # Convert to list of dictionaries
        result = country_partner_counts.to_dict('records')
        
        # Convert numpy types to Python native types
        return convert_numpy_types(result)
        
    except Exception as e:
        return {"error": f"Error analyzing partner counts by country: {str(e)}"}

# Example Usage (for testing)
# if __name__ == '__main__':
#     data = {
#         'Date': pd.to_datetime(['2023-01-15', '2023-01-20', '2023-02-10', '2023-02-25', '2023-01-28', '2023-03-05']),
#         'Partner ID': ['P1', 'P2', 'P1', 'P3', 'P2', 'P1'],
#         'Deriv Revenue': [100, 200, 150, 50, -10, 120],
#         'Region': ['Asia', 'Europe', 'Asia', 'NA', 'Europe', 'Asia'],
#         'Country': ['IN', 'UK', 'IN', 'US', 'UK', 'IN']
#     }
#     sample_df = pd.DataFrame(data)
#     analysis = analyze_performance(sample_df)
#     import json
#     print(json.dumps(analysis, indent=4)) 