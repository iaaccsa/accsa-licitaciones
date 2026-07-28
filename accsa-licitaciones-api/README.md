# Asistente de Licitaciones API

Este es un proyecto base de FastAPI para el Asistente de Licitaciones.

## Requisitos

- Python 3.8+
- pip

## Instalación

1.  Crea un entorno virtual:
    ```bash
    python -m venv venv
    source venv/bin/activate  # En Windows: venv\Scripts\activate
    ```

2.  Instala las dependencias:
    ```bash
    pip install -r requirements.txt
    ```

## Ejecución

Puedes ejecutar el servidor de desarrollo de dos formas:

1.  Directamente con Python:
    ```bash
    python -m app.main
    ```

2.  Usando Uvicorn desde la línea de comandos:
    ```bash
    uvicorn app.main:app --reload
    ```

    > **Nota:** Si obtienes un error como `ModuleNotFoundError`, es probable que tu terminal esté usando el `uvicorn` global en lugar del de tu entorno virtual. Intenta ejecutarlo así:
    > ```bash
    > python -m uvicorn app.main:app --reload
    > ```

El servidor iniciará en http://localhost:8000.
Puedes ver la documentación interactiva en http://localhost:8000/docs.

## Endpoints

-   `GET /`: Retorna el mensaje de bienvenida.
