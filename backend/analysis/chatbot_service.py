import os
import pandas as pd
import json
import traceback # Added for more detailed error logging
import numpy as np
from datetime import datetime
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from typing import Optional, List # Corrected List import
from pydantic.v1 import BaseModel, Field
from langchain_core.messages import HumanMessage, AIMessage

from backend.utils.dotenv_loader import load_env, get_env_variable
from backend.analysis.performance_analyzer import get_top_partner_for_metric_month, get_partner_counts_by_country, convert_numpy_types

# Load environment variables for API keys, etc.
load_env()

# --- LLM Initialization ---
llm = None
try:
    openai_api_key = get_env_variable("OPENAI_API_KEY")
    openai_model_name = get_env_variable("OPENAI_MODEL_NAME", "gpt-4.1") # Using gpt-4.1 instead of turbo
    openai_api_base = get_env_variable("API_BASE_URL")

    if openai_api_key:
        llm = ChatOpenAI(
            model_name=openai_model_name,
            openai_api_key=openai_api_key,
            openai_api_base=openai_api_base,
            temperature=0 # For more deterministic tool usage
        )
        print("[ChatbotService] LLM initialized.")
    else:
        print("[ChatbotService] OPENAI_API_KEY not found. LLM not initialized.")
except Exception as e:
    print(f"[ChatbotService] Error initializing LLM: {e}")

# --- Global variables for context management ---
current_df_for_tools = None
current_file_id_for_tools = None

def set_current_df_for_chatbot(df, file_id):
    """Sets the current dataframe and file_id for use in the chatbot tools."""
    global current_df_for_tools, current_file_id_for_tools
    current_df_for_tools = df
    current_file_id_for_tools = file_id
    print(f"[ChatbotService] Set current DataFrame for file_id: {file_id}")
    return True

# --- Pydantic Schemas for Tool Arguments ---
class GetTopPartnerToolSchema(BaseModel):
    metric: str = Field(description="The metric to evaluate, e.g., 'Deriv Revenue', 'FTT'. Column name must exist in the dataset.")
    year: int = Field(description="The year for the analysis, e.g., 2024.")
    month: int = Field(description="The month for the analysis (1-12), e.g., 4 for April.")
    # file_id is implicitly handled by the context this agent will operate in

class GetPartnerCountsByCountryToolSchema(BaseModel):
    pass  # No parameters needed, it operates on the entire dataset

class CompareCountriesByMonthSchema(BaseModel):
    countries: List[str] = Field(description="List of countries to compare, e.g., ['Vietnam', 'Kenya']")
    metric: str = Field(description="The metric to compare, e.g., 'Deriv Revenue', 'Active Clients'")
    months: int = Field(description="Number of most recent months to compare, e.g., 3 or 4")

class PartnersWithTrendSchema(BaseModel):
    trend_type: str = Field(description="Type of trend to identify: 'growth' for positive growth or 'decline' for downward trend")
    metric: str = Field(description="The metric to analyze, e.g., 'Deriv Revenue', 'Partner Commissions'")
    months: int = Field(description="Number of most recent months to analyze, default is 3", default=3)
    min_rate: float = Field(description="Minimum rate of change to consider (percentage), default is 10", default=10.0)

# --- Tools Definition ---
@tool(args_schema=GetTopPartnerToolSchema)
def get_top_partner_tool(metric: str, year: int, month: int) -> str:
    """
    Finds the top performing partner for a specific metric in a given month. 
    Returns details including Partner ID, value for the metric, Country, and Region.
    """
    print(f"[ChatbotService] Tool 'get_top_partner_tool' called with args: metric={metric}, year={year}, month={month}")
    if current_df_for_tools is None or current_df_for_tools.empty:
        return "Error: Data not loaded. Please ensure a file has been processed and selected for chat."
    
    df_copy = current_df_for_tools.copy()
    result = get_top_partner_for_metric_month(df_copy, metric, year, month)
    
    if isinstance(result, dict) and "error" in result:
        return f"Error from analysis function: {result['error']}"
    
    if isinstance(result, dict) and "message" in result:
        return result["message"]
    
    # Format the response to be more readable
    return f"""Top partner for {metric} in {month}/{year}:
Partner ID: {result['Partner ID']}
{metric}: {result[metric]}
Country: {result['Country']}
Region: {result['Region']}"""

# ---> ADDED: New tool for counting partners by country <---
@tool(args_schema=GetPartnerCountsByCountryToolSchema)
def get_partner_counts_by_country_tool() -> str:
    """Counts the number of unique partners for each country in the dataset."""
    print(f"[ChatbotService] Tool 'get_partner_counts_by_country_tool' called for file_id: {current_file_id_for_tools}")
    if current_df_for_tools is None or current_df_for_tools.empty:
        return "Error: Data not loaded. Please ensure a file has been processed and selected for chat."
    
    df_copy = current_df_for_tools.copy()
    result = get_partner_counts_by_country(df_copy)
    
    if isinstance(result, dict) and "error" in result:
        return f"Error from analysis function: {result['error']}"
    
    # Convert result to a more readable format
    if isinstance(result, list):
        countries_with_partners = []
        for item in result:
            if item.get('UniquePartnerCount', 0) > 0:
                countries_with_partners.append(f"{item['Country']}: {item['UniquePartnerCount']} partners")
        
        return "Partner counts by country:\n" + "\n".join(countries_with_partners)
    # Result is expected to be a list of dicts
    return json.dumps(convert_numpy_types(result))

# ---> ADDED: New tool to get countries by revenue <---
@tool
def get_countries_by_revenue() -> str:
    """Gets a list of countries ordered by total Deriv Revenue."""
    print(f"[ChatbotService] Tool 'get_countries_by_revenue' called for file_id: {current_file_id_for_tools}")
    if current_df_for_tools is None or current_df_for_tools.empty:
        return "Error: Data not loaded. Please ensure a file has been processed and selected for chat."
    
    df_copy = current_df_for_tools.copy()
    try:
        # Check if Country and Deriv Revenue columns exist
        if 'Country' not in df_copy.columns or 'Deriv Revenue' not in df_copy.columns:
            return "Error: Required columns 'Country' and/or 'Deriv Revenue' not found in dataset."
        
        # Group by Country and sum Deriv Revenue
        country_revenue = df_copy.groupby('Country')['Deriv Revenue'].sum().sort_values(ascending=False).reset_index()
        
        # Filter to only include countries with positive revenue
        positive_revenue_countries = country_revenue[country_revenue['Deriv Revenue'] > 0]
        
        if positive_revenue_countries.empty:
            return "No countries with positive revenue found in the dataset."
        
        # Convert NumPy types before formatting
        positive_revenue_countries = convert_numpy_types(positive_revenue_countries.to_dict('records'))
        
        # Format the response
        result = "Countries by total Deriv Revenue (highest to lowest):\n"
        for i, row in enumerate(positive_revenue_countries, 1):
            result += f"{i}. {row['Country']}: ${row['Deriv Revenue']:,.2f}\n"
        
        return result
    except Exception as e:
        return f"Error analyzing countries by revenue: {e}"

# ---> ADDED: New tool to find partners with negative revenue (actual losses) <---
@tool
def get_partners_with_negative_revenue(year: Optional[int] = None, month: Optional[int] = None) -> str:
    """Find partners who are generating losses (negative Deriv Revenue) for the company."""
    print(f"[ChatbotService] Tool 'get_partners_with_negative_revenue' called for file_id: {current_file_id_for_tools}")
    if current_df_for_tools is None or current_df_for_tools.empty:
        return "Error: Data not loaded. Please ensure a file has been processed and selected for chat."
    
    df_copy = current_df_for_tools.copy()
    try:
        # Check if necessary columns exist
        if 'Partner ID' not in df_copy.columns or 'Deriv Revenue' not in df_copy.columns:
            return "Error: Required columns 'Partner ID' and/or 'Deriv Revenue' not found in dataset."
        
        # Apply date filtering if specified
        if year is not None and month is not None:
            # Ensure Date column is datetime
            if not pd.api.types.is_datetime64_any_dtype(df_copy['Date']):
                df_copy['Date'] = pd.to_datetime(df_copy['Date'])
            # Filter by year and month
            df_filtered = df_copy[(df_copy['Date'].dt.year == year) & (df_copy['Date'].dt.month == month)]
            if df_filtered.empty:
                return f"No data found for period {month}/{year}."
            df_copy = df_filtered
            period_text = f"in {month}/{year}"
        else:
            period_text = "across all time periods"
        
        # Group by Partner ID and sum Deriv Revenue
        partner_revenue = df_copy.groupby(['Partner ID', 'Country', 'Region'])['Deriv Revenue'].sum().reset_index()
        
        # Find partners with negative revenue (actual losses)
        negative_revenue_partners = partner_revenue[partner_revenue['Deriv Revenue'] < 0].sort_values('Deriv Revenue')
        
        # Convert NumPy types to Python native types
        negative_revenue_partners = convert_numpy_types(negative_revenue_partners.to_dict('records'))
        
        if not negative_revenue_partners:
            return f"No partners found with negative Deriv Revenue (losses) {period_text}."
        
        # Format the response
        result = f"Partners generating losses (negative Deriv Revenue) {period_text}, ordered by highest losses:\n"
        for i, partner in enumerate(negative_revenue_partners, 1):
            result += f"{i}. Partner ID {partner['Partner ID']} from {partner['Country']} (Region: {partner['Region']}): ${partner['Deriv Revenue']:,.2f}\n"
        
        return result
    except Exception as e:
        return f"Error finding partners with negative revenue: {e}"

# ---> NEW TOOL: Compare countries by monthly metrics <---
@tool(args_schema=CompareCountriesByMonthSchema)
def compare_countries_by_month(countries: List[str], metric: str, months: int = 4) -> str:
    """Compare specified countries based on a metric with month-by-month breakdown."""
    print(f"[ChatbotService] Tool 'compare_countries_by_month' called with countries={countries}, metric={metric}, months={months}")
    if current_df_for_tools is None or current_df_for_tools.empty:
        return "Error: Data not loaded. Please ensure a file has been processed and selected for chat."
    
    df_copy = current_df_for_tools.copy()
    try:
        # Check if necessary columns exist
        if 'Country' not in df_copy.columns or metric not in df_copy.columns:
            return f"Error: Required columns 'Country' and/or '{metric}' not found in dataset."
        
        # Ensure Date column is datetime
        if 'Date' not in df_copy.columns:
            return "Error: Date column not found in dataset. Cannot perform monthly analysis."
            
        if not pd.api.types.is_datetime64_any_dtype(df_copy['Date']):
            df_copy['Date'] = pd.to_datetime(df_copy['Date'])
        
        # For this dataset, we know data is available until April 2025
        # Hard-code cutoff date to April 30, 2025 instead of using current date
        cutoff_date = pd.Timestamp('2025-04-30')
        # Filter to dates on or before the cutoff
        df_copy = df_copy[df_copy['Date'] <= cutoff_date]
        
        if df_copy.empty:
            return f"No data found for dates up to {cutoff_date.strftime('%Y-%m')}."
        
        # Sort by date
        df_copy = df_copy.sort_values('Date')
        
        # Extract year and month
        df_copy['Year-Month'] = df_copy['Date'].dt.strftime('%Y-%m')
        
        # Get the most recent months (based on actual dates, not string sorting)
        df_copy['month_key'] = df_copy['Date'].dt.year * 100 + df_copy['Date'].dt.month
        unique_month_keys = sorted(df_copy['month_key'].unique())
        
        if len(unique_month_keys) < months:
            months = len(unique_month_keys)
            months_keys_to_analyze = unique_month_keys
        else:
            months_keys_to_analyze = unique_month_keys[-months:]
        
        # Filter to the selected months
        filtered_df = df_copy[df_copy['month_key'].isin(months_keys_to_analyze)]
        months_to_analyze = sorted(filtered_df['Year-Month'].unique())
        
        # Filter data for the countries and months to analyze
        filtered_df = filtered_df[filtered_df['Country'].isin(countries)]
        
        if filtered_df.empty:
            return f"No data found for the specified countries in the last {months} months."
        
        # Group by Country and Year-Month
        results = filtered_df.groupby(['Country', 'Year-Month'])[metric].sum().reset_index()
        
        # Pivot to make it easier to compare
        pivot_results = results.pivot(index='Year-Month', columns='Country', values=metric).fillna(0)
        
        # Convert pivot_results to native Python types
        pivot_data = convert_numpy_types(pivot_results.to_dict())
        months_data = pivot_results.index.tolist()
        
        # Format the response
        response = f"Monthly {metric} Comparison for {', '.join(countries)}:\n\n"
        response += "Month     | " + " | ".join([f"{country:12}" for country in countries]) + "\n"
        response += "-" * (10 + sum([15 for _ in countries])) + "\n"
        
        for month in months_to_analyze:
            response += f"{month:10}| "
            for country in countries:
                if country in pivot_data and month in pivot_data[country]:
                    value = pivot_data[country][month]
                    if isinstance(value, (int, float)):
                        response += f"${value:12,.2f}| "
                    else:
                        response += f"{value:12}| "
                else:
                    response += f"{'No data':12}| "
            response += "\n"
        
        # Add summary statistics
        response += "\nTotal Comparison:\n"
        for country in countries:
            country_results = results[results['Country'] == country]
            if not country_results.empty:
                total = convert_numpy_types(country_results[metric].sum())
                response += f"- {country}: ${total:,.2f}\n"
            else:
                response += f"- {country}: $0.00\n"
        
        if len(countries) == 2:
            # Calculate ratio for easier comparison if exactly 2 countries
            country_totals = {}
            for country in countries:
                country_results = results[results['Country'] == country]
                if not country_results.empty:
                    country_totals[country] = convert_numpy_types(country_results[metric].sum())
                else:
                    country_totals[country] = 0
            
            if all(value > 0 for value in country_totals.values()):
                ratio = max(country_totals.values()) / min(country_totals.values())
                higher_country = max(country_totals.items(), key=lambda x: x[1])[0]
                lower_country = min(country_totals.items(), key=lambda x: x[1])[0]
                response += f"\n{higher_country} has {ratio:.1f}x higher {metric} than {lower_country} over this period."
        
        return response
        
    except Exception as e:
        traceback.print_exc()
        return f"Error comparing countries by month: {str(e)}"

# ---> NEW TOOL: Identify partners with growth or decline trends <---
@tool(args_schema=PartnersWithTrendSchema)
def identify_partners_with_trends(trend_type: str, metric: str, months: int = 3, min_rate: float = 10.0) -> str:
    """Identify partners showing significant growth or decline trends in specified metric."""
    print(f"[ChatbotService] Tool 'identify_partners_with_trends' called with trend_type={trend_type}, metric={metric}, months={months}")
    if current_df_for_tools is None or current_df_for_tools.empty:
        return "Error: Data not loaded. Please ensure a file has been processed and selected for chat."
    
    if trend_type not in ['growth', 'decline']:
        return "Error: trend_type must be either 'growth' or 'decline'."
    
    df_copy = current_df_for_tools.copy()
    try:
        # Check if necessary columns exist
        if 'Partner ID' not in df_copy.columns or metric not in df_copy.columns:
            return f"Error: Required columns 'Partner ID' and/or '{metric}' not found in dataset."
        
        # Ensure Date column is datetime
        if 'Date' not in df_copy.columns:
            return "Error: Date column not found in dataset. Cannot perform trend analysis."
            
        if not pd.api.types.is_datetime64_any_dtype(df_copy['Date']):
            df_copy['Date'] = pd.to_datetime(df_copy['Date'])
        
        # For this dataset, we know data is available until April 2025
        # Hard-code cutoff date to April 30, 2025 instead of using current date
        cutoff_date = pd.Timestamp('2025-04-30')
        # Filter to dates on or before the cutoff
        df_copy = df_copy[df_copy['Date'] <= cutoff_date]
        
        if df_copy.empty:
            return f"No data found for dates up to {cutoff_date.strftime('%Y-%m')}."
            
        # Sort by date
        df_copy = df_copy.sort_values('Date')
        
        # Extract year and month
        df_copy['Year-Month'] = df_copy['Date'].dt.strftime('%Y-%m')
        
        # Get the most recent months (based on actual dates, not string sorting)
        df_copy['month_key'] = df_copy['Date'].dt.year * 100 + df_copy['Date'].dt.month
        unique_month_keys = sorted(df_copy['month_key'].unique())
        
        if len(unique_month_keys) < months:
            months = len(unique_month_keys)
            months_keys_to_analyze = unique_month_keys
        else:
            months_keys_to_analyze = unique_month_keys[-months:]
        
        # Filter to the selected months
        filtered_df = df_copy[df_copy['month_key'].isin(months_keys_to_analyze)]
        months_to_analyze = sorted(filtered_df['Year-Month'].unique())
        
        if filtered_df.empty:
            return f"No data found for the specified time period."
        
        # Group by Partner ID and Year-Month
        partner_monthly = filtered_df.groupby(['Partner ID', 'Year-Month', 'Country', 'Region'])[metric].sum().reset_index()
        
        # Get unique partner IDs
        unique_partners = partner_monthly['Partner ID'].unique()
        
        # Store trend results
        trend_results = []
        
        # Calculate trend for each partner
        for partner_id in unique_partners:
            partner_data = partner_monthly[partner_monthly['Partner ID'] == partner_id].sort_values('Year-Month')
            
            if len(partner_data) >= 2:  # Need at least 2 data points to calculate a trend
                # Get oldest and newest values
                first_value = convert_numpy_types(partner_data.iloc[0][metric])
                last_value = convert_numpy_types(partner_data.iloc[-1][metric])
                
                # Skip if values are too small to calculate meaningful percent change
                if abs(first_value) < 1 or abs(last_value) < 1:
                    continue
                
                # Calculate percent change
                if first_value != 0:
                    percent_change = ((last_value - first_value) / abs(first_value)) * 100
                else:
                    # If first value is 0, we can't calculate percent change
                    continue
                
                # Use linear regression to determine if trend is consistent
                if len(partner_data) >= 3:
                    x = np.arange(len(partner_data))
                    y = partner_data[metric].values
                    
                    # Simple linear regression
                    slope, _ = np.polyfit(x, y, 1)
                    
                    # Determine trend consistency
                    consistent_direction = (slope > 0 and trend_type == 'growth') or (slope < 0 and trend_type == 'decline')
                    
                    if not consistent_direction:
                        continue  # Skip partners without consistent trend
                
                # Check if percent change meets minimum threshold and matches trend type
                significant_change = abs(percent_change) >= min_rate
                correct_direction = (percent_change > 0 and trend_type == 'growth') or (percent_change < 0 and trend_type == 'decline')
                
                if significant_change and correct_direction:
                    country = partner_data.iloc[-1]['Country']
                    region = partner_data.iloc[-1]['Region']
                    monthly_values = [f"{month}: ${convert_numpy_types(value):.2f}" for month, value in 
                                     zip(partner_data['Year-Month'], partner_data[metric])]
                    
                    trend_results.append({
                        'Partner ID': partner_id,
                        'Country': country,
                        'Region': region,
                        'First Value': first_value,
                        'Last Value': last_value,
                        'Percent Change': percent_change,
                        'Monthly Values': monthly_values
                    })
        
        # Convert any remaining NumPy types in trend_results
        trend_results = convert_numpy_types(trend_results)
        
        # Sort results by percent change (abs value, decreasing)
        trend_results.sort(key=lambda x: abs(x['Percent Change']), reverse=True)
        
        # Prepare response
        trend_word = "growth" if trend_type == 'growth' else "declining"
        response = f"Partners showing significant {trend_word} in {metric} over the last {months} months (minimum {min_rate}% change):\n\n"
        
        if not trend_results:
            return f"No partners found with significant {trend_word} trends (at least {min_rate}% change) in {metric}."
        
        # Generate report
        for i, result in enumerate(trend_results[:10], 1):  # Limit to top 10
            partner_id = result['Partner ID']
            country = result['Country']
            region = result['Region']
            first_value = result['First Value']
            last_value = result['Last Value']
            percent_change = result['Percent Change']
            monthly_values = result['Monthly Values']
            
            response += f"{i}. Partner ID: {partner_id} ({country}, {region})\n"
            response += f"   {months_to_analyze[0]}: ${first_value:.2f} → {months_to_analyze[-1]}: ${last_value:.2f}\n"
            response += f"   Change: {percent_change:.1f}%\n"
            if len(monthly_values) > 2:
                response += f"   Month-by-month: {', '.join(monthly_values)}\n"
            response += "\n"
        
        if len(trend_results) > 10:
            response += f"(Showing top 10 of {len(trend_results)} partners with significant {trend_word} trends)"
            
        return response
        
    except Exception as e:
        traceback.print_exc()
        return f"Error identifying {trend_type} trends: {str(e)}"

# ---> NEW TOOL: Identify partners at risk of churning <---
@tool
def identify_churn_risk_partners(months: int = 3, revenue_decline_percent: float = 20.0) -> str:
    """
    Identify partners that are at risk of churning based on significant revenue decline.
    This is a specialized version focusing specifically on churn risk indicators.
    """
    print(f"[ChatbotService] Tool 'identify_churn_risk_partners' called with months={months}, decline_threshold={revenue_decline_percent}%")
    
    if current_df_for_tools is None or current_df_for_tools.empty:
        return "Error: Data not loaded. Please ensure a file has been processed and selected for chat."
    
    df_copy = current_df_for_tools.copy()
    try:
        # Check if necessary columns exist
        if 'Partner ID' not in df_copy.columns or 'Deriv Revenue' not in df_copy.columns:
            return f"Error: Required columns 'Partner ID' and/or 'Deriv Revenue' not found in dataset."
        
        # Ensure Date column is datetime
        if 'Date' not in df_copy.columns:
            return "Error: Date column not found in dataset. Cannot perform trend analysis."
            
        if not pd.api.types.is_datetime64_any_dtype(df_copy['Date']):
            df_copy['Date'] = pd.to_datetime(df_copy['Date'])
        
        # For this dataset, we know data is available until April 2025
        # Hard-code cutoff date to April 30, 2025 instead of using current date
        cutoff_date = pd.Timestamp('2025-04-30')
        # Filter to dates on or before the cutoff
        df_copy = df_copy[df_copy['Date'] <= cutoff_date]
        
        if df_copy.empty:
            return f"No data found for dates up to {cutoff_date.strftime('%Y-%m')}."
        
        # Sort by date
        df_copy = df_copy.sort_values('Date')
        
        # Extract year and month
        df_copy['Year-Month'] = df_copy['Date'].dt.strftime('%Y-%m')
        
        # Get the most recent months (based on actual dates, not string sorting)
        df_copy['month_key'] = df_copy['Date'].dt.year * 100 + df_copy['Date'].dt.month
        unique_month_keys = sorted(df_copy['month_key'].unique())
        
        if len(unique_month_keys) < months:
            months = len(unique_month_keys)
            months_keys_to_analyze = unique_month_keys
        else:
            months_keys_to_analyze = unique_month_keys[-months:]
        
        # Filter to the selected months
        filtered_df = df_copy[df_copy['month_key'].isin(months_keys_to_analyze)]
        months_to_analyze = sorted(filtered_df['Year-Month'].unique())
        
        if filtered_df.empty:
            return f"No data found for the specified time period."
        
        # Group by Partner ID and Year-Month
        partner_monthly = filtered_df.groupby(['Partner ID', 'Year-Month', 'Country', 'Region'])['Deriv Revenue'].sum().reset_index()
        
        # Get unique partner IDs
        unique_partners = partner_monthly['Partner ID'].unique()
        
        # Store trend results
        churn_risk_partners = []
        
        # Calculate trend for each partner
        for partner_id in unique_partners:
            partner_data = partner_monthly[partner_monthly['Partner ID'] == partner_id].sort_values('Year-Month')
            
            if len(partner_data) >= 2:  # Need at least 2 data points to calculate a trend
                # Get oldest and newest values
                first_value = convert_numpy_types(partner_data.iloc[0]['Deriv Revenue'])
                last_value = convert_numpy_types(partner_data.iloc[-1]['Deriv Revenue'])
                
                # Skip if values are too small to calculate meaningful percent change
                if abs(first_value) < 1 or abs(last_value) < 1:
                    continue
                
                # Calculate percent change
                if first_value != 0:
                    percent_change = ((last_value - first_value) / abs(first_value)) * 100
                else:
                    # If first value is 0, we can't calculate percent change
                    continue
                
                # Use linear regression to determine if trend is consistent
                if len(partner_data) >= 3:
                    x = np.arange(len(partner_data))
                    y = partner_data['Deriv Revenue'].values
                    
                    # Simple linear regression
                    slope, _ = np.polyfit(x, y, 1)
                    
                    # Determine trend consistency - looking for negative slope
                    consistent_decline = slope < 0
                    
                    if not consistent_decline:
                        continue  # Skip partners without consistent decline
                
                # Check if percent change meets minimum threshold and is negative (decline)
                significant_decline = percent_change < 0 and abs(percent_change) >= revenue_decline_percent
                
                if significant_decline:
                    country = partner_data.iloc[-1]['Country']
                    region = partner_data.iloc[-1]['Region']
                    monthly_values = [f"{month}: ${convert_numpy_types(value):.2f}" for month, value in 
                                     zip(partner_data['Year-Month'], partner_data['Deriv Revenue'])]
                    
                    churn_risk_partners.append({
                        'Partner ID': partner_id,
                        'Country': country,
                        'Region': region,
                        'First Value': first_value,
                        'Last Value': last_value,
                        'Percent Change': percent_change,
                        'Monthly Values': monthly_values
                    })
        
        # Convert any remaining NumPy types
        churn_risk_partners = convert_numpy_types(churn_risk_partners)
        
        # Sort results by percent change (largest decline first)
        churn_risk_partners.sort(key=lambda x: x['Percent Change'])
        
        # Prepare response
        response = f"Partners at high risk of churning based on declining revenue over the last {months} months (minimum {revenue_decline_percent}% decline):\n\n"
        
        if not churn_risk_partners:
            return f"No partners found with significant revenue decline (at least {revenue_decline_percent}% drop) over the last {months} months."
        
        # Generate report
        for i, result in enumerate(churn_risk_partners[:10], 1):  # Limit to top 10
            partner_id = result['Partner ID']
            country = result['Country']
            region = result['Region']
            first_value = result['First Value']
            last_value = result['Last Value']
            percent_change = result['Percent Change']
            monthly_values = result['Monthly Values']
            
            response += f"{i}. Partner ID: {partner_id} ({country}, {region})\n"
            response += f"   {months_to_analyze[0]}: ${first_value:.2f} → {months_to_analyze[-1]}: ${last_value:.2f}\n"
            response += f"   Decline: {percent_change:.1f}%\n"
            if len(monthly_values) > 2:
                response += f"   Month-by-month: {', '.join(monthly_values)}\n"
            response += "\n"
        
        if len(churn_risk_partners) > 10:
            response += f"(Showing top 10 of {len(churn_risk_partners)} partners at risk of churning)"
            
        return response
        
    except Exception as e:
        traceback.print_exc()
        return f"Error identifying churn risk partners: {str(e)}"

# Add the new tools to the tools list
tools = [
    get_top_partner_tool, 
    get_partner_counts_by_country_tool, 
    get_countries_by_revenue, 
    get_partners_with_negative_revenue,
    compare_countries_by_month,
    identify_partners_with_trends,
    identify_churn_risk_partners
]

# --- Agent Initialization (Simplified for now) ---
# This agent will be re-initialized per request with the appropriate file_id context (via current_df_for_tools)
agent_executor = None
if llm:
    # Basic prompt for OpenAI Tools agent
    # More complex prompting would involve system messages, examples, etc.
    prompt = ChatPromptTemplate.from_messages([
        ("system", (
            "You are a helpful financial data analyst specializing in partner performance analytics. "
            "You have access to a dataset of PartnerDashboard partner performance data including metrics like "
            "Deriv Revenue, Expected Revenue, Partner Commissions, Total Deposits, Active Clients, and FTT. "
            "\n\n"
            "IMPORTANT TERMINOLOGY CLARIFICATION:"
            "\n- In this business context, 'Deriv Revenue' represents client losses that benefit the company (positive values)"
            "\n- Negative 'Deriv Revenue' values represent company losses (clients are winning)"
            "\n- When asked about 'losses', clarify if the user means:"
            "\n  1. Partners with negative Deriv Revenue (company loses money) or"
            "\n  2. Partners with high positive Deriv Revenue (clients lose more money)"
            "\n\n"
            "DATA SOURCES EXPLANATION:"
            "\n- The platform supports two data sources: 'MyAffiliate' and 'PartnerDashboard'"
            "\n- MyAffiliate is a third-party tracking platform that tracks partner/affiliate performance"
            "\n- PartnerDashboard is our internal tracking system that provides more detailed metrics"
            "\n- The dashboard allows comparing and combining data from both sources"
            "\n- When analyzing data, consider which source the user is currently viewing"
            "\n- GP Team Region is a geographical organization of our partners that can be used for filtering"
            "\n\n"
            "When answering questions or analyzing data:"
            "\n- First determine if your tools can provide precise answers"
            "\n- Prefer to use specific tools over general knowledge whenever possible"
            "\n- Maintain context from previous questions in the conversation"
            "\n- Provide insightful analysis, not just raw numbers"
            "\n- Be direct and concise in your answers"
            "\n\n"
            "Available tools:"
            "\n1. 'get_top_partner_tool' - Finds the top performing partner for a specific metric in a specific month and year."
            "\n2. 'get_partner_counts_by_country_tool' - Provides a count of unique partners for each country."
            "\n3. 'get_countries_by_revenue' - Lists countries ordered by total Deriv Revenue."
            "\n4. 'get_partners_with_negative_revenue' - Finds partners generating losses (negative Deriv Revenue) for the company."
            "\n5. 'compare_countries_by_month' - Compares specified countries based on a metric with month-by-month breakdown."
            "\n6. 'identify_partners_with_trends' - Identifies partners showing significant growth or decline trends in a specified metric."
            "\n7. 'identify_churn_risk_partners' - Identifies partners at risk of churning based on significant revenue decline."
            "\n\n"
            "If asked about something not covered by your tools, say you don't have that specific data available rather than making up answers."
        )),
        MessagesPlaceholder(variable_name="chat_history", optional=True),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])
    agent = create_openai_tools_agent(llm, tools, prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, handle_parsing_errors=True)
    print("[ChatbotService] Agent executor initialized.")
else:
    print("[ChatbotService] LLM not initialized, cannot create agent executor.")

def set_current_df_for_chatbot(df: Optional[pd.DataFrame], file_id: Optional[str]):
    """Sets the DataFrame to be used by the tools."""
    global current_df_for_tools, current_file_id_for_tools
    current_df_for_tools = df
    current_file_id_for_tools = file_id
    if df is not None:
        print(f"[ChatbotService] DataFrame for file_id '{file_id}' set for chatbot tools. Shape: {df.shape}")
    else:
        print("[ChatbotService] DataFrame for chatbot tools cleared.")

def convert_chat_history_to_langchain_messages(chat_history):
    """
    Converts the chat history from frontend format to LangChain messages format.
    
    Expected frontend format:
    [
        {"sender": "user", "text": "message content"},
        {"sender": "bot", "text": "response content"}
    ]
    
    Returns a list of LangChain Message objects.
    """
    if not chat_history or not isinstance(chat_history, list):
        return []
    
    langchain_messages = []
    for message in chat_history:
        if not isinstance(message, dict) or "sender" not in message or "text" not in message:
            continue
        
        if message["sender"] == "user":
            langchain_messages.append(HumanMessage(content=message["text"]))
        elif message["sender"] == "bot":
            langchain_messages.append(AIMessage(content=message["text"]))
    
    return langchain_messages

def invoke_chatbot(user_query: str, chat_history: Optional[List] = None) -> str:
    if not agent_executor:
        return "Chatbot is not available (LLM or agent initialization failed)."
    if current_df_for_tools is None:
        return "Data has not been loaded for analysis. Please upload and process a file first."

    print(f"[ChatbotService] Invoking agent for file_id '{current_file_id_for_tools}' with query: {user_query}")
    try:
        # Convert chat history to LangChain format if provided
        langchain_chat_history = []
        if chat_history:
            langchain_chat_history = convert_chat_history_to_langchain_messages(chat_history)
            print(f"[ChatbotService] Converted {len(chat_history)} messages to {len(langchain_chat_history)} LangChain messages")
        
        # Prepare input for the agent with chat history if available
        input_dict = {"input": user_query}
        if langchain_chat_history:
            input_dict["chat_history"] = langchain_chat_history
        
        response = agent_executor.invoke(input_dict)
        return response.get("output", "Agent did not produce an output.")
    except Exception as e:
        print(f"[ChatbotService] Error during agent invocation: {e}")
        traceback.print_exc()
        return f"Error processing your request via chatbot: {e}" 