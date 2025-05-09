import os
from dotenv import load_dotenv

def load_env():
    load_dotenv()
 
def get_env_variable(variable_name, default_value=None):
    return os.getenv(variable_name, default_value) 