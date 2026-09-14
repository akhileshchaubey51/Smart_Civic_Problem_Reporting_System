"""
CampusCare Database Module
Provides connection pooling and helper methods for SQL Server queries.
"""
import pyodbc
from datetime import datetime, date
from decimal import Decimal
from contextlib import contextmanager
from backend.config import Config

def dict_row(cursor, row):
    """Convert pyodbc Row object into a clean JSON-serializable dictionary."""
    if row is None:
        return None
    d = {}
    for idx, col in enumerate(cursor.description):
        name = col[0]
        val = row[idx]
        if isinstance(val, (datetime, date)):
            d[name] = val.isoformat()
        elif isinstance(val, Decimal):
            d[name] = float(val)
        else:
            d[name] = val
    return d

@contextmanager
def get_db_connection():
    """Context manager for establishing database connections with auto-cleanup."""
    conn_str = Config.get_connection_string()
    conn = pyodbc.connect(conn_str)
    try:
        yield conn
    finally:
        conn.close()

def query_db(query, params=(), one=False):
    """
    Executes a SELECT query and returns rows as dictionaries.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        if one:
            row = cursor.fetchone()
            return dict_row(cursor, row) if row else None
        else:
            rows = cursor.fetchall()
            return [dict_row(cursor, r) for r in rows]

def execute_db(query, params=(), commit=True):
    """
    Executes an INSERT, UPDATE, or DELETE statement.
    Supports OUTPUT INSERTED.* clauses to return newly inserted data.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        result = None
        # Check if query returns a result set (e.g., OUTPUT INSERTED.ID)
        try:
            if cursor.description:
                rows = cursor.fetchall()
                result = [dict_row(cursor, r) for r in rows]
        except pyodbc.ProgrammingError:
            result = None

        if commit:
            conn.commit()
        return result

def execute_transaction(operations):
    """
    Executes a list of (sql_statement, params) inside an atomic transaction.
    Returns list of results.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        results = []
        try:
            for sql, params in operations:
                cursor.execute(sql, params)
                try:
                    if cursor.description:
                        rows = cursor.fetchall()
                        results.append([dict_row(cursor, r) for r in rows])
                    else:
                        results.append(None)
                except pyodbc.ProgrammingError:
                    results.append(None)
            conn.commit()
            return results
        except Exception as e:
            conn.rollback()
            raise e
