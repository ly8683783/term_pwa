FROM my-http-service

WORKDIR /usr/share/nginx/html

COPY index.html \
     manifest.json \
     service_worker.js \
     styles.css \
     app_version.js \
     file_picker.js \
     terminal_log_store.js \
     debug_logger.js \
     hex_utils.js \
     main.js \
     serial_transport.js \
     serial_port_store.js \
     serial_port.js \
     serial_event_bus.js \
     serial_session.js \
     quick_send.js \
     terminal_page.js \
     netview_parser.js \
     topology_view.js \
     netview_page.js \
     ymodem_crc.js \
     firmware_update.js \
     config_page.js \
     ./

COPY icons ./icons

COPY nginx.conf /etc/nginx/conf.d/default.conf
