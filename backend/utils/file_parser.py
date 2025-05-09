from unstructured.partition.xlsx import partition_xlsx
import pandas as pd
import io # Import the io module
import traceback # Import traceback

def parse_excel(file_path):
    """Parses an Excel file and returns a list of table elements."""
    print(f"--- Parsing Excel file: {file_path} ---")
    elements = [] # Initialize elements to an empty list
    try:
        elements = partition_xlsx(filename=file_path, infer_table_structure=True, strategy="hi_res")
        print(f"Unstructured found {len(elements)} elements in total.")
    except Exception as e:
        print(f"Error during unstructured.partition_xlsx: {e}")
        return {"error": f"Failed to partition Excel file with unstructured: {e}"}
        
    tables = []
    other_elements_summary = {}
    for i_el, element in enumerate(elements):
        # print(f"Element {i_el+1}/{len(elements)}: Category - {element.category}") # Can be verbose
        if element.category == "Table":
            tables.append(element)
        else:
            other_elements_summary[element.category] = other_elements_summary.get(element.category, 0) + 1
            
    if other_elements_summary:
        print(f"Summary of non-Table elements: {other_elements_summary}")

    if not tables:
        print("No elements categorized as 'Table' by unstructured.")
        return {"error": "No elements categorized as 'Table' by unstructured in the Excel file."}
    else:
        print(f"Found {len(tables)} elements categorized as 'Table'. Proceeding to parse them.")

    dataframes = []
    for i_tbl, table_element in enumerate(tables):
        print(f"--- Processing Table element {i_tbl+1}/{len(tables)} ---")
        html_content = None # Initialize html_content
        try:
            if hasattr(table_element, 'metadata') and hasattr(table_element.metadata, 'text_as_html') and table_element.metadata.text_as_html:
                html_content = table_element.metadata.text_as_html
                
                # Try parsing with a multi-level header (indices 0 and 1)
                print("  Attempting parse with header=[0, 1]")
                df_list = pd.read_html(io.StringIO(html_content), flavor='html5lib', header=[0, 1])
                
                if df_list:
                    print(f"  Successfully parsed HTML table into {len(df_list)} DataFrame(s) using pandas with html5lib, header=[0, 1].")
                    print("  DataFrame Head (first table parsed):")
                    print(df_list[0].head())
                    print("  DataFrame Columns (first table parsed):")
                    print(df_list[0].columns)
                    print("  -------------------------------------")
                    dataframes.extend(df_list)
                else:
                    print("  pd.read_html (with html5lib, header=[0, 1]) returned an empty list.")
            else:
                print("  Skipping table element: no 'text_as_html' content found in metadata.")
        except Exception as e:
            print(f"  Error parsing this table element with pandas (using html5lib): {e}")
            # Print detailed traceback
            print("--- Traceback --- ")
            traceback.print_exc()
            print("--- End Traceback --- ")
            if html_content:
                problem_html_filename = f"problem_table_{i_tbl+1}.html"
                try:
                    with open(problem_html_filename, "w", encoding="utf-8") as f_html:
                        f_html.write(html_content)
                    print(f"  Problematic HTML content saved to: {problem_html_filename}")
                except Exception as e_write:
                    print(f"  Failed to write problematic HTML to file: {e_write}")
            continue

    if not dataframes:
        print("No DataFrames were successfully parsed from any table elements after attempting pandas.read_html.")
        return {"error": "No data could be extracted into tables from the Excel file after processing all elements."}

    print(f"Successfully parsed {len(dataframes)} DataFrame(s) in total from Excel table elements.")
    
    final_df = None
    if len(dataframes) > 1:
        print(f"Found multiple ({len(dataframes)}) pandas DataFrames. Concatenating them. Review if this is the desired behavior.")
        try:
            final_df = pd.concat(dataframes, ignore_index=True)
        except Exception as e:
            print(f"Error concatenating DataFrames: {e}")
            return {"error": f"Could not combine multiple tables found in Excel: {e}"}
    elif dataframes: # This means len(dataframes) == 1
        final_df = dataframes[0]
    # If dataframes is empty, it's caught by the check above
        
    if final_df is None or final_df.empty:
        print("Final DataFrame is empty after concatenation or selection.")
        return {"error": "Resulting table data is empty after processing."}

    print("--- Finished parsing Excel file --- ")
    return final_df 