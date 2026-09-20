import csv
import os

class EfosValidator:
    def __init__(self, csv_path=None):
        self.efos_db = {}
        # Path to a locally cached SAT list (Listado_Completo_69-B.csv)
        self.csv_path = csv_path or os.path.join(os.path.dirname(__file__), "Listado_Completo_69-B.csv")
        self._load_db()
        
    def _load_db(self):
        """Carga el listado 69-B en memoria como un diccionario rápido."""
        if not os.path.exists(self.csv_path):
            # En un entorno real, descargaríamos el CSV de la página del SAT si no existe.
            # Por ahora, dejamos el diccionario vacío.
            return
            
        try:
            with open(self.csv_path, mode='r', encoding='utf-8-sig') as f:
                # El SAT suele usar encabezados largos, simplificamos la lógica a índices
                reader = csv.reader(f)
                headers = next(reader, None)
                for row in reader:
                    if len(row) > 3:
                        rfc = row[1].strip().upper()
                        nombre = row[2].strip()
                        situacion = row[3].strip() # Definitivo, Desvirtuado, Presunto
                        self.efos_db[rfc] = {
                            "nombre": nombre,
                            "situacion": situacion
                        }
        except Exception as e:
            print(f"Error cargando base de EFOS: {str(e)}")

    def check_rfc(self, rfc: str) -> dict:
        """Verifica si un RFC está en la lista negra del SAT."""
        rfc = rfc.strip().upper()
        if rfc in self.efos_db:
            return {
                "is_efo": True,
                "status": self.efos_db[rfc]["situacion"]
            }
        return {
            "is_efo": False,
            "status": "Limpio"
        }
