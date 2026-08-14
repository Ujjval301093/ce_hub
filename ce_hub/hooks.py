app_name = "ce_hub"
app_title = "C&E Employee Hub"
app_publisher = "C and E Consultancy Private Limited"
app_description = "C&E Employee Hub"
app_email = "info@candeconsultancy.com"
app_license = "mit"

app_include_js = []
app_include_css = []

website_route_rules = [
	{'from_route': '/ce-hub/<path:app_path>', 'to_route': 'ce-hub'},
	{'from_route': '/ce-hub', 'to_route': 'ce-hub'}
]
