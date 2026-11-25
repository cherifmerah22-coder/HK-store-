package dz.hkstore.app

import android.util.Log
import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import org.json.JSONArray
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

@CapacitorPlugin(name = "HKLocalAI")
class HKLocalAIPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var engine: InferenceEngine? = null
    @Volatile private var modelReady = false
    @Volatile private var loading = false

    @PluginMethod
    fun notificationAccessStatus(call: PluginCall) {
        val enabled = Settings.Secure.getString(
            context.contentResolver, "enabled_notification_listeners"
        ) ?: ""
        val component = ComponentName(context, HKSomfyNotificationListener::class.java)
        val granted = enabled.split(":").any { it == component.flattenToString() }
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun openNotificationAccessSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve(JSObject().put("ok", true))
        } catch (e: Exception) {
            call.reject(e.message ?: "تعذر فتح إعدادات الوصول إلى الإشعارات.")
        }
    }

    @PluginMethod
    fun readSomfyNotifications(call: PluginCall) {
        val raw = context.getSharedPreferences("hk_somfy_notifications", 0)
            .getString("events", "[]") ?: "[]"
        call.resolve(JSObject().put("events", JSONArray(raw)))
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val state = engine?.state?.value
        call.resolve(JSObject().apply {
            put("ok", modelReady)
            put("provider", "llama.cpp-android-local")
            put("model", "Qwen2.5-1.5B-Instruct")
            put("installed", true)
            put("loading", loading)
            put("message", when {
                modelReady -> "الذكاء الاصطناعي المحلي جاهز."
                loading -> "يجري تجهيز النموذج لأول مرة."
                else -> "النموذج مدمج وسيتم تجهيزه عند أول استعمال."
            })
            put("state", state?.javaClass?.simpleName ?: "not_started")
        })
    }

    @PluginMethod
    fun loadModel(call: PluginCall) {
        scope.launch {
            try {
                ensureModel()
                call.resolve(JSObject().put("ok", true).put("provider", "llama.cpp-android-local"))
            } catch (e: Exception) {
                Log.e("HKLocalAI", "Model initialization failed", e)
                call.reject(e.message ?: "تعذر تشغيل نموذج الذكاء الاصطناعي.")
            }
        }
    }

    @PluginMethod
    fun complete(call: PluginCall) {
        val task = call.getString("task") ?: "diagnosis"
        val context = call.getString("context") ?: ""
        if (context.isBlank()) {
            call.reject("أدخل تفاصيل الطلب أولاً.")
            return
        }
        if (context.length > 9000) {
            call.reject("النص أطول من الحد المسموح.")
            return
        }
        scope.launch {
            try {
                val local = ensureModel()
                val instruction = when (task) {
                    "welcome" -> "اكتب جملة ترحيب واحدة قصيرة بالدارجة الجزائرية لزبون دخل محل HK STORE. لا تخمن هويته أو عمره أو سبب زيارته. أخرج الجملة فقط."
                    "accessory" -> "أنت مستشار مبيعات خبير لمتجر HK STORE. مهمتك مساعدة البائع على اختيار الإكسسوارات المكملة للهاتف الدقيق، وليس مجرد سرد المنتجات. اقرأ سياق المستخدم وقسّم البيانات إلى منتجات مؤكدة التوافق ومتوفرة، وبدائل محتملة غير مؤكدة. اعرض المنتجات المؤكدة فقط على أنها صالحة للبيع لهذا الهاتف، مع الاسم والفئة والسعر والكمية كما وردت حرفياً. استعمل البدائل المحتملة فقط لاقتراح فحص عملي للبائع، وصرّح بوضوح أنها غير مؤكدة ولا يجوز بيعها على أنها متوافقة قبل التجربة وتسجيل الموديل بعد موافقة المدير. لواقي الشاشة/الصدمات/العدسات/الأغطية: اطلب مقارنة الشكل والأبعاد والحواف وفتحات الكاميرا والأزرار والسماعة والبصمة؛ للشاحن والكابل: تحقق من المنفذ والقدرة والجهد وبروتوكول الشحن؛ للسماعات: تحقق من نوع الاتصال والمنفذ؛ وللحامل والبطارية وبقية الإكسسوارات: اطلب تحققاً خاصاً بنوع المنتج. اقترح إضافات مكملة فقط إذا كانت موجودة ضمن المنتجات المؤكدة. لا تستنتج التوافق من تشابه الاسم أو المقاس أو موديل قريب. لا تخترع أي منتج أو سعر أو كمية أو مواصفة. إذا لم توجد منتجات مؤكدة، قل ذلك واقترح على البائع ما الذي يجب قياسه أو التحقق منه قبل اعتماد بديل. أجب بالعربية الواضحة والدارجة الجزائرية عند الحاجة، بإجابة قصيرة وعملية."
                    else -> "أنت تقني صيانة محترف. حلل الأعراض واقترح فحوصاً آمنة مرتبة. لا تجزم بتلف قطعة دون قياس. لا تقدم تجاوز FRP أو Activation Lock أو تغيير IMEI. لا تقترح مسحاً أو تفليشاً دون موافقة الزبون والنسخ الاحتياطي."
                }
                val prompt = "المهمة: $instruction\n\nالمعلومات:\n$context\n\nأجب بوضوح وبخطوات عملية. إذا كانت المعلومات غير كافية فاطلب القياس أو التحقق الناقص."
                val answer = StringBuilder()
                local.sendUserPrompt(prompt, 512).collect { token -> answer.append(token) }
                call.resolve(JSObject().apply {
                    put("ok", true)
                    put("provider", "llama.cpp-android-local")
                    put("model", "Qwen2.5-1.5B-Instruct")
                    put("answer", answer.toString())
                })
            } catch (e: Exception) {
                Log.e("HKLocalAI", "Inference failed", e)
                call.reject(e.message ?: "تعذر تنفيذ التحليل المحلي.")
            }
        }
    }

    @Synchronized
    private fun getEngine(): InferenceEngine {
        if (engine == null) engine = AiChat.getInferenceEngine(context.applicationContext)
        return engine!!
    }

    private suspend fun ensureModel(): InferenceEngine {
        if (modelReady && engine != null) return engine!!
        loading = true
        try {
            val local = getEngine()
            val state = withTimeout(240_000L) {
                local.state.first { it is InferenceEngine.State.Initialized || it is InferenceEngine.State.Error }
            }
            if (state is InferenceEngine.State.Error) throw state.exception

            val modelsDir = File(context.filesDir, "models")
            if (!modelsDir.exists() && !modelsDir.mkdirs()) throw IllegalStateException("تعذر إنشاء مجلد النموذج.")
            val model = File(modelsDir, "qwen2.5-1.5b-instruct-q4_k_m.gguf")
            if (!model.exists() || model.length() < 800_000_000L) {
                val temp = File(modelsDir, model.name + ".part")
                context.assets.open("ai/qwen2.5-1.5b-instruct-q4_k_m.gguf").use { input ->
                    FileOutputStream(temp).use { output ->
                        val buffer = ByteArray(1024 * 1024)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            output.write(buffer, 0, count)
                        }
                        output.fd.sync()
                    }
                }
                if (!temp.renameTo(model)) throw IllegalStateException("تعذر تثبيت ملف نموذج الذكاء الاصطناعي.")
            }
            local.loadModel(model.absolutePath)
            local.setSystemPrompt("أنت مساعد HK STORE في الجزائر. أجب بالعربية والدارجة الجزائرية عند الملاءمة. كن دقيقاً ومتحفظاً. لا تخترع معلومات أو توافق منتجات. لا تساعد على تجاوز أقفال الحماية أو تغيير IMEI. اطلب موافقة الزبون والنسخ الاحتياطي قبل الإجراءات المدمرة.")
            modelReady = true
            return local
        } finally {
            loading = false
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }
}
