import React, {ReactNode, useEffect, useRef, useState} from "react"
import {
    Space,
    Tag,
    Progress,
    Divider,
    Form,
    Input,
    Button,
    Card,
    Spin,
    Radio,
    Popconfirm,
    Tabs,
    Checkbox,
    Modal,
    Row,
    Col,
    Slider,
    Tooltip,
    Timeline
} from "antd"
import {AutoCard} from "@/components/AutoCard"
import styles from "./SimpleDetect.module.scss"
import {Route} from "@/routes/routeSpec"
import classNames from "classnames"
import {ContentUploadInput} from "@/components/functionTemplate/ContentUploadTextArea"
import {failed, info, success, warn} from "@/utils/notification"
import {randomString} from "@/utils/randomUtil"
import {
    showUnfinishedSimpleDetectTaskList,
    UnfinishedSimpleDetectBatchTask
} from "../invoker/batch/UnfinishedBatchTaskList"
import {useGetState, useMemoizedFn, useDebounceEffect} from "ahooks"
import type {SliderMarks} from "antd/es/slider"
import {showDrawer, showModal} from "../../utils/showModal"
import {ScanPortForm, PortScanParams, defaultPorts} from "../portscan/PortScanPage"
import {ExecResult, YakScript} from "../invoker/schema"
import {useStore, simpleDetectParams} from "@/store"
import {DownloadOnlinePluginByTokenRequest, DownloadOnlinePluginAllResProps} from "@/pages/yakitStore/YakitStorePage"
import {OpenPortTableViewer} from "../portscan/PortTable"
import {SimpleCardBox} from "../yakitStore/viewers/base"
import moment from "moment"
import {CreatReportScript} from "./CreatReportScript"
import useHoldingIPCRStream, {InfoState} from "../../hook/useHoldingIPCRStream"
import {ExtractExecResultMessageToYakitPort, YakitPort} from "../../components/yakitLogSchema"
import type {CheckboxValueType} from "antd/es/checkbox/Group"
import {RiskDetails} from "@/pages/risks/RiskTable"
import {formatTimestamp} from "../../utils/timeUtil"
import {ResizeBox} from "../../components/ResizeBox"
import {SimpleCloseInfo, setSimpleInfo, delSimpleInfo} from "@/pages/globalVariable"

const {ipcRenderer} = window.require("electron")
const CheckboxGroup = Checkbox.Group

const plainOptions = ["弱口令", "漏洞扫描", "合规检测"]
const layout = {
    labelCol: {span: 6},
    wrapperCol: {span: 16}
}
const marks: SliderMarks = {
    1: {
        label: <div>慢速</div>
    },
    2: {
        label: <div>适中</div>
    },
    3: {
        label: <div>快速</div>
    }
}

interface SimpleDetectFormProps {
    setPercent: (v: number) => void
    percent: number
    setExecuting: (v: boolean) => void
    token: string
    sendTarget?: string
    executing: boolean
    openScriptNames: string[] | undefined
    YakScriptOnlineGroup?: string
    isDownloadPlugin: boolean
    baseProgress?: number
    TaskName?: string
    runTaskName?: string
    setRunTaskName: (v: string) => void
    setRunTimeStamp: (v: number) => void
    setRunPluginCount: (v: number) => void
    reset: () => void
    filePtrValue: number
    oldRunParams?: OldRunParamsProps
    Uid?: string
}

export const SimpleDetectForm: React.FC<SimpleDetectFormProps> = (props) => {
    const {
        percent,
        setPercent,
        setExecuting,
        token,
        sendTarget,
        executing,
        openScriptNames,
        YakScriptOnlineGroup,
        isDownloadPlugin,
        baseProgress,
        TaskName,
        runTaskName,
        setRunTaskName,
        setRunTimeStamp,
        setRunPluginCount,
        reset,
        filePtrValue,
        oldRunParams,
        Uid
    } = props
    const [form] = Form.useForm()
    const [uploadLoading, setUploadLoading] = useState(false)

    const [params, setParams, getParams] = useGetState<PortScanParams>({
        Ports: defaultPorts,
        Mode: "fingerprint",
        Targets: sendTarget ? JSON.parse(sendTarget || "[]").join(",") : "",
        ScriptNames: openScriptNames || [],
        // SYN 并发
        SynConcurrent: 1000,
        // 指纹并发
        Concurrent: 50,
        Active: true,
        // 服务指纹级别
        ProbeMax: 100,
        // 主动探测超时
        ProbeTimeout: 7,
        // web/服务/all
        FingerprintMode: "all",
        Proto: ["tcp"],

        EnableBasicCrawler: true,
        BasicCrawlerRequestMax: 5,

        SaveToDB: true,
        SaveClosedPorts: false,
        EnableCClassScan: false,
        SkippedHostAliveScan: false,
        HostAlivePorts: "22,80,443",
        ExcludeHosts: "",
        ExcludePorts: "",
        Proxy: []
    })

    const [_, setScanType, getScanType] = useGetState<string>("基础扫描")
    const [checkedList, setCheckedList, getCheckedList] = useGetState<CheckboxValueType[]>(["弱口令", "合规检测"])
    const [__, setScanDeep, getScanDeep] = useGetState<number>(3)
    const isInputValue = useRef<boolean>(false)
    // 继续任务操作屏蔽
    const [shield, setShield] = useState<boolean>(false)

    useEffect(() => {
        if (oldRunParams) {
            const {LastRecord, PortScanRequest} = oldRunParams
            const {Targets, TargetsFile} = PortScanRequest
            setParams({...params, Targets: Targets || TargetsFile})
            setShield(true)
        }
    }, [oldRunParams])

    useEffect(() => {
        if (YakScriptOnlineGroup) {
            let arr: string[] = YakScriptOnlineGroup.split(",")
            let selectArr: any[] = []
            arr.map((item) => {
                switch (item) {
                    case "弱口令":
                        selectArr.push("弱口令")
                        break
                    case "漏洞扫描":
                        selectArr.push("漏洞扫描")
                        break
                    case "合规检测":
                        selectArr.push("合规检测")
                        break
                    default:
                        setScanType(item)
                        break
                }
            })
            if (selectArr.length > 0) {
                setCheckedList(selectArr)
                setScanType("自定义")
            }
        }
    }, [YakScriptOnlineGroup])

    useEffect(() => {
        if (!isInputValue.current) {
            // 任务名称-时间戳
            const taskNameTimeStamp: number = moment(new Date()).unix()
            form.setFieldsValue({
                TaskName: `${getScanType()}-${taskNameTimeStamp}`
            })
            setRunTaskName(`${getScanType()}-${taskNameTimeStamp}`)
        }
    }, [getScanType(), executing])

    useEffect(() => {
        if (TaskName) {
            form.setFieldsValue({
                TaskName: TaskName || "漏洞扫描任务"
            })
        }
    }, [TaskName])

    // 保存任务
    const saveTask = (v?:string) => {
        const cacheData = v?JSON.parse(v):false
        console.log("SimpleCloseInfo",SimpleCloseInfo,token,cacheData);

        let newParams: PortScanParams = {...getParams()}
        const OnlineGroup: string = getScanType() !== "自定义" ? getScanType() : [...checkedList].join(",")
        if (oldRunParams) {
            const {LastRecord, PortScanRequest} = oldRunParams
            ipcRenderer.invoke("SaveCancelSimpleDetect", cacheData||{
                LastRecord,
                PortScanRequest
            })
        } else {
            ipcRenderer.invoke("SaveCancelSimpleDetect",  cacheData||{
                LastRecord:{
                    LastRecordPtr: filePtrValue,
                    Percent: percent,
                    YakScriptOnlineGroup: OnlineGroup
                },
                PortScanRequest: {...newParams, TaskName: runTaskName}
            })
        }
        delSimpleInfo(token)
    }

    // 更新销毁参数
    useDebounceEffect(() => {
        let obj = {}
        if (oldRunParams) {
            const {LastRecord, PortScanRequest} = oldRunParams
            obj = {
                LastRecord,
                PortScanRequest
            }
        }
        else{
            let newParams: PortScanParams = {...getParams()}
            const OnlineGroup: string = getScanType() !== "自定义" ? getScanType() : [...checkedList].join(",")
            obj = {
                LastRecord: {
                    LastRecordPtr: filePtrValue,
                    Percent: percent,
                    YakScriptOnlineGroup: OnlineGroup
                },
                PortScanRequest: {...newParams, TaskName: runTaskName}
            }
        }
        setSimpleInfo(token, executing,JSON.stringify(obj))
    }, [executing, oldRunParams, filePtrValue, percent, getScanType(), runTaskName])

    useEffect(() => {
        return () => {
            // 任务运行中
            SimpleCloseInfo[token]?.status&&saveTask(SimpleCloseInfo[token].info)
        }
    }, [])

    const run = (OnlineGroup: string, TaskName: string) => {
        setPercent(0)
        // 时间戳生成
        const timeStamp: number = moment(new Date()).unix()
        setRunTimeStamp(timeStamp)
        setRunPluginCount(getParams().ScriptNames.length)

        reset()
        console.log("params11----", getParams())
        setRunTaskName(TaskName)
        setExecuting(true)
        let newParams: PortScanParams = {...getParams()}
        switch (getScanDeep()) {
            // 快速
            case 3:
                // 指纹并发
                newParams.Concurrent = 100
                // SYN 并发
                newParams.SynConcurrent = 2000
                newParams.Ports = params.Ports
                newParams.ProbeTimeout = 3
                // 指纹详细程度
                newParams.ProbeMax = 3
                // newParams.ScriptNames = ["MySQL CVE 合规检查: 2016-2022"]
                // newParams.Ports = "3306"
                break
            // 适中
            case 2:
                newParams.Concurrent = 80
                newParams.SynConcurrent = 1000
                newParams.Ports = params.Ports
                newParams.ProbeTimeout = 5
                newParams.ProbeMax = 5
                break
            // 慢速
            case 1:
                newParams.Concurrent = 50
                newParams.SynConcurrent = 1000
                newParams.Ports = params.Ports
                newParams.ProbeTimeout = 7
                newParams.ProbeMax = 7
                break
        }
        let LastRecord = {}
        let PortScanRequest = {...newParams, TaskName: TaskName}
        ipcRenderer.invoke(
            "SimpleDetect",
            {
                LastRecord,
                PortScanRequest
            },
            token
        )
    }

    const recoverRun = () => {
        const timeStamp: number = moment(new Date()).unix()
        setRunTimeStamp(timeStamp)
        reset()
        setExecuting(true)
        ipcRenderer.invoke("RecoverSimpleDetectUnfinishedTask", {Uid}, token)
    }

    const onFinish = useMemoizedFn((values) => {
        const {TaskName} = values
        if (!params.Targets && !params.TargetsFile) {
            warn("需要设置扫描目标")
            return
        }
        if (TaskName.length === 0) {
            warn("请输入任务名称")
            return
        }
        if (getScanType() === "自定义" && getCheckedList().length === 0) {
            warn("请选择自定义内容")
            return
        }

        const OnlineGroup: string = getScanType() !== "自定义" ? getScanType() : [...checkedList].join(",")
        // 继续任务 参数拦截
        if (Uid) {
            recoverRun()
        }
        // 当为跳转带参
        else if (Array.isArray(openScriptNames)) {
            run(OnlineGroup, TaskName)
        } else {
            ipcRenderer
                .invoke("QueryYakScriptByOnlineGroup", {OnlineGroup})
                .then((data: {Data: YakScript[]}) => {
                    const ScriptNames: string[] = data.Data.map((item) => item.OnlineScriptName)
                    setParams({...getParams(), ScriptNames})
                    run(OnlineGroup, TaskName)
                })
                .catch((e) => {
                    failed(`查询扫描模式错误:${e}`)
                })
                .finally(() => {})
        }
    })

    const onCancel = useMemoizedFn(() => {
        if (Uid) {
            ipcRenderer.invoke("cancel-RecoverSimpleDetectUnfinishedTask", token)
        } else {
            ipcRenderer.invoke("cancel-SimpleDetect", token)
        }
        saveTask()
    })

    const judgeExtra = () => {
        let str: string = ""
        switch (getScanType()) {
            case "基础扫描":
                str = "包含合规检测、小字典弱口令检测与部分漏洞检测"
                break
            case "深度扫描":
                str = "包含合规检测、大字典弱口令检测与所有漏洞检测"
                break
            case "自定义":
                str = "自定义选择需要扫描的内容"
                break
        }
        return str
    }

    return (
        <div className={styles["simple-detect-form"]} style={{marginTop: 20}}>
            <Form {...layout} form={form} onFinish={onFinish}>
                <Spin spinning={uploadLoading}>
                    <ContentUploadInput
                        type='textarea'
                        dragger={{
                            disabled: executing || shield
                        }}
                        beforeUpload={(f) => {
                            const typeArr: string[] = [
                                "text/plain",
                                ".csv",
                                ".xls",
                                ".xlsx",
                                "application/vnd.ms-excel",
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            ]
                            if (!typeArr.includes(f.type)) {
                                failed(`${f.name}非txt、Excel文件，请上传txt、Excel格式文件！`)
                                return false
                            }

                            setUploadLoading(true)
                            ipcRenderer.invoke("fetch-file-content", (f as any).path).then((res) => {
                                let Targets = res
                                // 处理Excel格式文件
                                if (f.type !== "text/plain") {
                                    let str = JSON.stringify(res)
                                    Targets = str.replace(/(\[|\]|\{|\}|\")/g, "")
                                }
                                setParams({...params, Targets})
                                setTimeout(() => setUploadLoading(false), 100)
                            })
                            return false
                        }}
                        item={{
                            style: {textAlign: "left"},
                            label: "扫描目标:"
                        }}
                        textarea={{
                            isBubbing: true,
                            setValue: (Targets) => setParams({...params, Targets}),
                            value: params.Targets,
                            rows: 1,
                            placeholder: "域名/主机/IP/IP段均可，逗号分隔或按行分割",
                            disabled: executing || shield
                        }}
                        otherHelpNode={
                            <>
                                <span
                                    onClick={() => {
                                        showDrawer({
                                            title: "设置高级参数",
                                            width: "60%",
                                            content: (
                                                <>
                                                    <ScanPortForm
                                                        isSimpleDetectShow={true}
                                                        defaultParams={params}
                                                        setParams={(value) => {
                                                            setParams(value)
                                                        }}
                                                    />
                                                </>
                                            )
                                        })
                                    }}
                                    className={styles["help-hint-title"]}
                                >
                                    更多参数
                                </span>
                                <span
                                    onClick={() => {
                                        showUnfinishedSimpleDetectTaskList((task: UnfinishedSimpleDetectBatchTask) => {
                                            ipcRenderer.invoke("send-to-tab", {
                                                type: "simple-batch-exec-recover",
                                                data: task
                                            })
                                        })
                                    }}
                                    className={styles["help-hint-title"]}
                                >
                                    未完成任务
                                </span>
                            </>
                        }
                        suffixNode={
                            executing ? (
                                <Button type='primary' danger disabled={!executing} onClick={onCancel}>
                                    立即停止任务
                                </Button>
                            ) : (
                                <Button type='primary' htmlType='submit' disabled={isDownloadPlugin}>
                                    开始检测
                                </Button>
                            )
                        }
                    />
                </Spin>
                <div style={executing ? {display: "none"} : {}}>
                    <Form.Item name='scan_type' label='扫描模式' extra={judgeExtra()}>
                        <Radio.Group
                            buttonStyle='solid'
                            defaultValue={"基础扫描"}
                            onChange={(e) => {
                                setScanType(e.target.value)
                            }}
                            value={getScanType()}
                            disabled={shield}
                        >
                            <Radio.Button value='基础扫描'>基础扫描</Radio.Button>
                            <Radio.Button value='深度扫描'>深度扫描</Radio.Button>
                            <Radio.Button value='自定义'>自定义</Radio.Button>
                        </Radio.Group>
                        {getScanType() === "自定义" && (
                            <CheckboxGroup
                                disabled={shield}
                                style={{paddingLeft: 18}}
                                options={plainOptions}
                                value={checkedList}
                                onChange={(list) => setCheckedList(list)}
                            />
                        )}
                    </Form.Item>
                    <div style={{display: "none"}}>
                        <Form.Item name='TaskName' label='任务名称'>
                            <Input
                                disabled={shield}
                                style={{width: 400}}
                                placeholder='请输入任务名称'
                                allowClear
                                onChange={() => {
                                    isInputValue.current = true
                                }}
                            />
                        </Form.Item>
                    </div>

                    <Form.Item name='scan_deep' label='扫描速度' style={{position: "relative"}}>
                        <Slider
                            tipFormatter={null}
                            value={getScanDeep()}
                            onChange={(value) => setScanDeep(value)}
                            style={{width: 400}}
                            min={1}
                            max={3}
                            marks={marks}
                            disabled={shield}
                        />
                        <div style={{position: "absolute", top: 26, fontSize: 12, color: "gray"}}>
                            扫描速度越慢，扫描结果就越详细，可根据实际情况进行选择
                        </div>
                    </Form.Item>
                </div>
            </Form>
        </div>
    )
}

export interface SimpleDetectTableProps {
    token: string
    executing: boolean
    runTaskName?: string
    runTimeStamp?: number
    runPluginCount?: number
    infoState: InfoState
    setExecuting: (v: boolean) => void
}

export const SimpleDetectTable: React.FC<SimpleDetectTableProps> = (props) => {
    const {token, executing, runTaskName, runTimeStamp, runPluginCount, infoState, setExecuting} = props

    const [openPorts, setOpenPorts] = useState<YakitPort[]>([])
    const openPort = useRef<YakitPort[]>([])
    // 下载报告Modal
    const [reportModalVisible, setReportModalVisible] = useState<boolean>(false)
    const [reportName, setReportName] = useState<string>(runTaskName || "默认报告名称")
    const [reportLoading, setReportLoading] = useState<boolean>(false)
    const [_, setReportId, getReportId] = useGetState<number>()
    // 是否允许更改TaskName
    const isSetTaskName = useRef<boolean>(true)
    // 报告token
    const [reportToken, setReportToken] = useState(randomString(40))
    // 是否展示报告生成进度
    const [showReportPercent, setShowReportPercent] = useState<boolean>(false)
    // 报告生成进度
    const [reportPercent, setReportPercent] = useState(0)

    useEffect(() => {
        if (!reportModalVisible) {
            setReportLoading(false)
            setShowReportPercent(false)
            ipcRenderer.invoke("cancel-ExecYakCode", reportToken)
        }
    }, [reportModalVisible])

    useEffect(() => {
        // 报告生成成功
        if (getReportId()) {
            setReportLoading(false)
            setShowReportPercent(false)
            setReportPercent(0)
            setReportModalVisible(false)
            ipcRenderer.invoke("open-user-manage", Route.DB_Report)
            setTimeout(() => {
                ipcRenderer.invoke("simple-open-report", getReportId())
            }, 300)
        }
    }, [getReportId()])

    useEffect(() => {
        if (executing) {
            openPort.current = []
            executing && setOpenPorts([])
        }
        // 重新执行任务 重置已输入报告名
        runTaskName && setReportName(runTaskName)
        isSetTaskName.current = true
    }, [executing])

    useEffect(() => {
        if (runTaskName && isSetTaskName.current) {
            setReportName(runTaskName)
        }
    }, [runTaskName])

    useEffect(() => {
        ipcRenderer.on(`${token}-data`, async (e: any, data: ExecResult) => {
            if (data.IsMessage) {
                try {
                    let messageJsonRaw = Buffer.from(data.Message).toString("utf8")
                    let logInfo = ExtractExecResultMessageToYakitPort(JSON.parse(messageJsonRaw))
                    if (!logInfo) return

                    if (logInfo.isOpen) {
                        openPort.current.unshift(logInfo)
                        // 限制20条数据
                        openPort.current = openPort.current.slice(0, 20)
                    } else {
                        // closedPort.current.unshift(logInfo)
                    }
                } catch (e) {
                    failed("解析端口扫描结果失败...")
                }
            }
        })
        ipcRenderer.on(`${token}-error`, (e: any, error: any) => {
            failed(`[SimpleDetect] error:  ${error}`)
        })
        ipcRenderer.on(`${token}-end`, (e: any, data: any) => {
            info("[SimpleDetect] finished")
            setExecuting(false)
        })

        const syncPorts = () => {
            if (openPort.current) setOpenPorts([...openPort.current])
            // if (closedPort.current) setClosedPorts([...closedPort.current])
        }

        syncPorts()
        let id = setInterval(syncPorts, 1000)
        return () => {
            clearInterval(id)
            ipcRenderer.invoke("cancel-SimpleDetect", token)
            ipcRenderer.removeAllListeners(`${token}-data`)
            ipcRenderer.removeAllListeners(`${token}-error`)
            ipcRenderer.removeAllListeners(`${token}-end`)
        }
    }, [])
    /** 通知软件打开管理页面 */
    const openMenu = () => {
        ipcRenderer.invoke("open-user-manage", Route.DB_Risk)
    }
    /** 获取生成报告返回结果 */
    useEffect(() => {
        ipcRenderer.on(`${reportToken}-data`, (e, data: ExecResult) => {
            if (data.IsMessage) {
                // console.log("获取生成报告返回结果", new Buffer(data.Message).toString())
                const obj = JSON.parse(new Buffer(data.Message).toString())
                console.log(obj)
                if (obj?.type === "progress") {
                    setReportPercent(obj.content.progress)
                }
                setReportId(parseInt(obj.content.data))
            }
        })
        return () => {
            ipcRenderer.removeAllListeners(`${reportToken}-data`)
            // ipcRenderer.removeAllListeners(`client-yak-data`)
        }
    }, [reportToken])
    /** 通知生成报告 */
    const creatReport = () => {
        setReportId(undefined)
        setReportModalVisible(true)
    }

    /** 获取扫描主机数 扫描端口数 */
    const getProtAndHost = (v: string) => {
        const item = infoState.statusState.filter((item) => item.tag === v)
        if (item.length > 0) {
            return parseInt(item[0].info[0].Data)
        }
        return null
    }

    /** 下载报告 */
    const downloadReport = () => {
        // 脚本数据
        const scriptData = CreatReportScript
        const reqParams = {
            Script: scriptData,
            Params: [
                {Key: "timestamp", Value: runTimeStamp},
                {Key: "report_name", Value: reportName},
                {Key: "plugins", Value: runPluginCount},
                {Key: "host_total", Value: getProtAndHost("扫描主机数")},
                {Key: "port_total", Value: getProtAndHost("扫描端口数")}
            ]
        }

        ipcRenderer.invoke("ExecYakCode", reqParams, reportToken)
    }
    return (
        <div className={styles["simple-detect-table"]}>
            <div className={styles["result-table-body"]}>
                <Tabs
                    className='scan-port-tabs'
                    tabBarStyle={{marginBottom: 5}}
                    tabBarExtraContent={
                        <div>
                            {runTimeStamp && (
                                <>
                                    {!executing ? (
                                        <div className={styles["hole-text"]} onClick={creatReport}>
                                            生成报告
                                        </div>
                                    ) : (
                                        <div className={styles["disable-hole-text"]}>生成报告</div>
                                    )}
                                </>
                            )}
                        </div>
                    }
                >
                    {!!infoState.riskState && infoState.riskState.length > 0 && (
                        <Tabs.TabPane tab={`漏洞与风险`} key={"risk"} forceRender>
                            <AutoCard
                                bodyStyle={{overflowY: "auto"}}
                                extra={
                                    <div className={styles["hole-text"]} onClick={openMenu}>
                                        查看完整漏洞
                                    </div>
                                }
                            >
                                <Space direction={"vertical"} style={{width: "100%"}} size={12}>
                                    {infoState.riskState.slice(0, 10).map((i) => {
                                        return <RiskDetails info={i} shrink={true} />
                                    })}
                                </Space>
                            </AutoCard>
                        </Tabs.TabPane>
                    )}

                    <Tabs.TabPane tab={"扫描端口列表"} key={"scanPort"} forceRender>
                        <div style={{width: "100%", height: "100%", overflow: "hidden auto"}}>
                            <Row style={{marginTop: 6}} gutter={6}>
                                <Col span={24}>
                                    <OpenPortTableViewer data={openPorts} isSimple={true} />
                                </Col>
                            </Row>
                        </div>
                    </Tabs.TabPane>
                    {/* <Tabs.TabPane tab={"插件日志"} key={"pluginPort"} forceRender>
                        <div style={{width: "100%", height: "100%", overflow: "hidden auto"}}>
                            <PluginResultUI
                                loading={false}
                                progress={[]}
                                results={infoState.messageState}
                                featureType={infoState.featureTypeState}
                                feature={infoState.featureMessageState}
                                statusCards={infoState.statusState}
                            />
                        </div>
                    </Tabs.TabPane> */}
                </Tabs>
            </div>
            <Modal
                title='下载报告'
                visible={reportModalVisible}
                footer={null}
                onCancel={() => {
                    setReportModalVisible(false)
                    if (reportPercent < 1 && reportPercent > 0) {
                        warn("取消生成报告")
                    }
                }}
            >
                <div>
                    <div style={{textAlign: "center"}}>
                        <Input
                            style={{width: 400}}
                            placeholder='请输入任务名称'
                            allowClear
                            value={reportName}
                            onChange={(e) => {
                                isSetTaskName.current = false
                                setReportName(e.target.value)
                            }}
                        />
                        {showReportPercent && (
                            <div style={{width: 400, margin: "0 auto"}}>
                                <Progress
                                    // status={executing ? "active" : undefined}
                                    percent={parseInt((reportPercent * 100).toFixed(0))}
                                />
                            </div>
                        )}
                    </div>
                    <div style={{marginTop: 20, textAlign: "right"}}>
                        <Button
                            style={{marginRight: 8}}
                            onClick={() => {
                                setReportModalVisible(false)
                                if (reportPercent < 1 && reportPercent > 0) {
                                    warn("取消生成报告")
                                }
                            }}
                        >
                            取消
                        </Button>
                        <Button
                            loading={reportLoading}
                            type={"primary"}
                            onClick={() => {
                                setReportLoading(true)
                                downloadReport()
                                setShowReportPercent(true)
                            }}
                        >
                            确定
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

interface DownloadAllPluginProps {
    type?: "modal" | "default"
    setDownloadPlugin?: (v: boolean) => void
    onClose?: () => void
}

export const DownloadAllPlugin: React.FC<DownloadAllPluginProps> = (props) => {
    const {setDownloadPlugin, onClose} = props
    const type = props.type || "default"
    // 全局登录状态
    const {userInfo} = useStore()
    // 全部添加进度条
    const [addLoading, setAddLoading] = useState<boolean>(false)
    // 全部添加进度
    const [percent, setPercent, getPercent] = useGetState<number>(0)
    const [taskToken, setTaskToken] = useState(randomString(40))
    useEffect(() => {
        if (!taskToken) {
            return
        }
        ipcRenderer.on(`${taskToken}-data`, (_, data: DownloadOnlinePluginAllResProps) => {
            const p = Math.floor(data.Progress * 100)
            setPercent(p)
        })
        ipcRenderer.on(`${taskToken}-end`, () => {
            setTimeout(() => {
                type === "default" && setAddLoading(false)
                setPercent(0)
                setDownloadPlugin && setDownloadPlugin(false)
                onClose && onClose()
            }, 500)
        })
        ipcRenderer.on(`${taskToken}-error`, (_, e) => {})
        return () => {
            ipcRenderer.removeAllListeners(`${taskToken}-data`)
            ipcRenderer.removeAllListeners(`${taskToken}-error`)
            ipcRenderer.removeAllListeners(`${taskToken}-end`)
        }
    }, [taskToken])
    const AddAllPlugin = useMemoizedFn(() => {
        if (!userInfo.isLogin) {
            warn("我的插件需要先登录才能下载，请先登录")
            return
        }
        // 全部添加
        setAddLoading(true)
        setDownloadPlugin && setDownloadPlugin(true)
        let addParams: DownloadOnlinePluginByTokenRequest = {isAddToken: true, BindMe: false}
        ipcRenderer
            .invoke("DownloadOnlinePluginAll", addParams, taskToken)
            .then(() => {})
            .catch((e) => {
                failed(`添加失败:${e}`)
            })
    })
    const StopAllPlugin = () => {
        onClose && onClose()
        setAddLoading(false)
        ipcRenderer.invoke("cancel-DownloadOnlinePluginAll", taskToken).catch((e) => {
            failed(`停止添加失败:${e}`)
        })
    }
    if (type === "modal") {
        return (
            <div className={styles["download-all-plugin-modal"]}>
                {addLoading ? (
                    <div>
                        <div>下载进度</div>
                        <div className={styles["filter-opt-progress-modal"]}>
                            <Progress
                                size='small'
                                status={!addLoading && percent !== 0 ? "exception" : undefined}
                                percent={percent}
                            />
                        </div>
                        <div style={{textAlign: "center", marginTop: 10}}>
                            <Button type='primary' onClick={StopAllPlugin}>
                                取消
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div>检测到本地未下载任何插件，无法进行安全检测，请点击“一键导入”进行插件下载</div>
                        <div style={{textAlign: "center", marginTop: 10}}>
                            <Button type='primary' onClick={AddAllPlugin}>
                                一键导入
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        )
    }
    return (
        <div className={styles["download-all-plugin"]}>
            {addLoading && (
                <div className={styles["filter-opt-progress"]}>
                    <Progress
                        size='small'
                        status={!addLoading && percent !== 0 ? "exception" : undefined}
                        percent={percent}
                    />
                </div>
            )}
            {addLoading ? (
                <Button style={{marginLeft: 12}} size='small' type='primary' danger onClick={StopAllPlugin}>
                    停止
                </Button>
            ) : (
                <Popconfirm
                    title={"确定将插件商店所有数据导入到本地吗?"}
                    onConfirm={AddAllPlugin}
                    okText='Yes'
                    cancelText='No'
                    placement={"left"}
                >
                    <div className={styles["operation-text"]}>一键导入插件</div>
                </Popconfirm>
            )}
        </div>
    )
}

export interface SimpleDetectProps {
    Uid?: string
    BaseProgress?: number
    YakScriptOnlineGroup?: string
    TaskName?: string
}

interface OldRunParamsProps {
    LastRecord: any
    PortScanRequest: any
}

export const SimpleDetect: React.FC<SimpleDetectProps> = (props) => {
    const {Uid, BaseProgress, YakScriptOnlineGroup, TaskName} = props
    // console.log("Uid-BaseProgress", Uid, BaseProgress, YakScriptOnlineGroup, TaskName)
    const [percent, setPercent] = useState(0)
    const [executing, setExecuting] = useState<boolean>(false)
    const [token, setToken] = useState(randomString(20))
    const [loading, setLoading] = useState<boolean>(false)
    // 打开新页面任务参数
    const [openScriptNames, setOpenScriptNames] = useState<string[]>()
    const [oldRunParams, setOldRunParams] = useState<OldRunParamsProps>()

    const [isDownloadPlugin, setDownloadPlugin] = useState<boolean>(false)

    // 点击运行任务的最新TaskName
    const [runTaskName, setRunTaskName] = useState<string>()
    // 获取运行任务时间戳
    const [runTimeStamp, setRunTimeStamp] = useState<number>()
    // 获取运行任务插件数
    const [runPluginCount, setRunPluginCount] = useState<number>()

    const [infoState, {reset, setXtermRef, resetAll}] = useHoldingIPCRStream(
        "simple-scan",
        "SimpleDetect",
        token,
        () => {},
        () => {},
        (obj, content) => content.data.indexOf("isOpen") > -1 && content.data.indexOf("port") > -1
    )

    // 获取tabId用于变色
    const [_, setTabId, getTabId] = useGetState<string>()

    // 是否拖动ResizeBox
    const isResize = useRef<boolean>(false)
    // 设置ResizeBox高度
    const [__, setResizeBoxSize, getResizeBoxSize] = useGetState<string>("430px")

    const statusCards = infoState.statusState.filter((item) =>
        ["加载插件", "漏洞/风险", "开放端口数", "存活主机数/扫描主机数"].includes(item.tag)
    )

    const filePtr = infoState.statusState.filter((item) => ["当前文件指针"].includes(item.tag))
    const filePtrValue: number = Array.isArray(filePtr) ? parseInt(filePtr[0]?.info[0]?.Data) : 0

    useEffect(() => {
        if (!isResize.current) {
            if (executing) {
                statusCards.length === 0 ? setResizeBoxSize("116px") : setResizeBoxSize("206px")
            } else {
                statusCards.length === 0 ? setResizeBoxSize("295px") : setResizeBoxSize("385px")
            }
        }
    }, [executing, statusCards.length])

    useEffect(() => {
        setTabId(simpleDetectParams.tabId)
    }, [])

    useEffect(() => {
        if (BaseProgress !== undefined && BaseProgress > 0) {
            setPercent(BaseProgress)
        }
        if (infoState.processState.length > 0) {
            setPercent(infoState.processState[0].progress)
        }
    }, [BaseProgress, infoState.processState])

    useEffect(() => {
        if (Uid) {
            setLoading(true)
            ipcRenderer
                .invoke("GetSimpleDetectUnfinishedTaskByUid", {
                    Uid
                })
                .then(({LastRecord, PortScanRequest}) => {
                    const {ScriptNames} = PortScanRequest
                    setOldRunParams({
                        LastRecord,
                        PortScanRequest
                    })
                    setOpenScriptNames(ScriptNames)
                })
                .catch((e) => {
                    console.info(e)
                })
                .finally(() => setTimeout(() => setLoading(false), 600))
        }
    }, [Uid])

    useEffect(() => {
        if (getTabId()) {
            let status = ""
            if (executing) {
                // console.log("percent-executing", getTabId(), percent, executing)
                status = "run"
            }
            if (percent > 0 && percent < 1 && !executing) {
                status = "stop"
            }
            if (percent === 1 && !executing) {
                status = "success"
            }
            !!status &&
                ipcRenderer.invoke("refresh-tabs-color", {
                    tabId: getTabId(),
                    status
                })
        }
    }, [percent, executing, getTabId()])

    const timelineItemProps = (infoState.messageState || [])
        .filter((i) => {
            return i.level === "info"
        })
        .splice(0, 3)
    return (
        <>
            {loading && <Spin tip={"正在恢复未完成的任务"} />}
            <div className={styles["simple-detect"]} style={loading ? {display: "none"} : {}}>
                <ResizeBox
                    isVer={true}
                    firstNode={
                        <AutoCard
                            size={"small"}
                            bordered={false}
                            title={!executing ? <DownloadAllPlugin setDownloadPlugin={setDownloadPlugin} /> : null}
                            bodyStyle={{display: "flex", flexDirection: "column", padding: "0 5px", overflow: "hidden"}}
                        >
                            <Row>
                                {(percent > 0 || executing) && (
                                    <Col span={6}>
                                        <div style={{display: "flex"}}>
                                            <span style={{marginRight: 10}}>任务进度:</span>
                                            <div style={{flex: 1}}>
                                                <Progress
                                                    status={executing ? "active" : undefined}
                                                    percent={parseInt((percent * 100).toFixed(0))}
                                                />
                                            </div>
                                        </div>

                                        <Timeline
                                            pending={loading}
                                            style={{marginTop: 10, marginBottom: 10, maxHeight: 90}}
                                        >
                                            {(timelineItemProps || []).map((e, index) => {
                                                return (
                                                    <div key={index} className={styles["log-list"]}>
                                                        [{formatTimestamp(e.timestamp, true)}]: {e.data}
                                                    </div>
                                                )
                                            })}
                                        </Timeline>
                                    </Col>
                                )}
                                <Col span={percent > 0 || executing ? 18 : 24}>
                                    <SimpleDetectForm
                                        executing={executing}
                                        setPercent={setPercent}
                                        percent={percent}
                                        setExecuting={setExecuting}
                                        token={token}
                                        openScriptNames={openScriptNames}
                                        YakScriptOnlineGroup={YakScriptOnlineGroup}
                                        isDownloadPlugin={isDownloadPlugin}
                                        baseProgress={BaseProgress}
                                        TaskName={TaskName}
                                        runTaskName={runTaskName}
                                        setRunTaskName={setRunTaskName}
                                        setRunTimeStamp={setRunTimeStamp}
                                        setRunPluginCount={setRunPluginCount}
                                        reset={resetAll}
                                        filePtrValue={filePtrValue}
                                        oldRunParams={oldRunParams}
                                        Uid={Uid}
                                    />
                                </Col>
                            </Row>

                            <Divider style={{margin: 4}} />

                            <SimpleCardBox statusCards={statusCards} />
                        </AutoCard>
                    }
                    firstMinSize={"200px"}
                    firstRatio={getResizeBoxSize()}
                    secondMinSize={200}
                    onChangeSize={() => {
                        isResize.current = true
                    }}
                    secondNode={() => {
                        return (
                            <SimpleDetectTable
                                token={token}
                                executing={executing}
                                runTaskName={runTaskName}
                                runTimeStamp={runTimeStamp}
                                runPluginCount={runPluginCount}
                                infoState={infoState}
                                setExecuting={setExecuting}
                            />
                        )
                    }}
                />
            </div>
        </>
    )
}
